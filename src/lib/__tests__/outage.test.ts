import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAuditLog } from "@/lib/audit/log";
import { getDb } from "@/lib/db/client";
import { aiHealth } from "@/lib/db/schema";
import { resetStore } from "@/lib/f3/store";
import {
  AI_OUTAGE_THRESHOLD,
  currentOutage,
  getAiHealth,
  recordInferenceFailure,
  recordInferenceSuccess,
  recordOutageNotification,
  shouldAttemptInference,
  staticMaterial,
} from "../f2/outage";

/**
 * AI講師の停止検知（受け入れ基準 F2②・未決#14）。
 *
 * ここで固定する性質:
 * 1. 閾値未満の連続失敗では止まらない（1回の取りこぼしで16人の画面を切り替えない）
 * 2. 閾値で停止中になり、**切り替えは1件だけ勝つ**（講師通知が二重にならない）
 * 3. 停止中は推論を呼ばない。ただし間隔が空けば1件だけ再試行する
 * 4. 成功で復旧し、連続失敗も通知状態も消える
 * 5. 停止・復旧は監査ログに残る
 */
describe("AI講師の停止検知", () => {
  const savedEnv = { ...process.env };

  beforeEach(async () => {
    await resetStore();
    process.env.AI_OUTAGE_PROBE_INTERVAL_MS = "60000";
    delete process.env.STATIC_MATERIAL_URL;
    delete process.env.STATIC_MATERIAL_TITLE;
  });
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("閾値未満の連続失敗では停止中にならない", async () => {
    for (let i = 0; i < AI_OUTAGE_THRESHOLD - 1; i += 1) {
      const r = await recordInferenceFailure();
      expect(r.opened).toBe(false);
      expect(r.outage).toBeNull();
    }
    expect(await currentOutage()).toBeNull();
    expect((await shouldAttemptInference()).attempt).toBe(true);
  });

  it("閾値に達した1件だけが停止中への切替に勝つ（通知の二重送信を防ぐ）", async () => {
    for (let i = 0; i < AI_OUTAGE_THRESHOLD - 1; i += 1) await recordInferenceFailure();

    // 閾値到達の失敗が同時に複数来ても opened は1件だけ
    const results = await Promise.all([
      recordInferenceFailure(),
      recordInferenceFailure(),
      recordInferenceFailure(),
    ]);
    expect(results.filter((r) => r.opened)).toHaveLength(1);
    expect(results.every((r) => r.outage !== null)).toBe(true);

    const audit = (await getAuditLog()).filter((e) => e.entity === "ai_outage");
    expect(audit).toHaveLength(1);
    expect(audit[0].after).toMatchObject({ status: "down" });
  });

  it("停止中は推論を呼ばず、間隔が空いたら1件だけ再試行する", async () => {
    for (let i = 0; i < AI_OUTAGE_THRESHOLD; i += 1) await recordInferenceFailure();

    // 直後（切替時に再試行時刻を刻んでいる）: 呼ばない
    const blocked = await shouldAttemptInference();
    expect(blocked.attempt).toBe(false);

    // 前回の再試行を間隔より前に戻す（sleepで待つ代わりに時刻を巻き戻す）。
    // **間隔0では同時2件の排他は保証できない**（ミリ秒が1つ違えば両方通る）ため、
    // 排他の検証は実際の間隔（1秒）で行う。E2Eの間隔0は「絞らない」設定で、
    // 排他ではなく即時復旧を試すためのもの
    process.env.AI_OUTAGE_PROBE_INTERVAL_MS = "1000";
    await getDb()
      .update(aiHealth)
      .set({ lastAttemptAt: new Date(Date.now() - 2_000) })
      .where(eq(aiHealth.id, 1));
    const [a, b] = await Promise.all([shouldAttemptInference(), shouldAttemptInference()]);
    expect([a.attempt, b.attempt].filter(Boolean)).toHaveLength(1);

    // 直後（間隔内）はもう通らない
    expect((await shouldAttemptInference()).attempt).toBe(false);
  });

  it("成功で復旧し、連続失敗・通知状態が消え、監査ログに残る", async () => {
    for (let i = 0; i < AI_OUTAGE_THRESHOLD; i += 1) await recordInferenceFailure();
    await recordOutageNotification({ state: "skipped", reason: "Canvas未接続" });
    expect((await getAiHealth()).notifySkippedReason).toBe("Canvas未接続");

    const r = await recordInferenceSuccess();
    expect(r.recovered).toBe(true);

    const health = await getAiHealth();
    expect(health.outageStartedAt).toBeNull();
    expect(health.consecutiveFailures).toBe(0);
    expect(health.notifySkippedReason).toBeNull();

    const audit = (await getAuditLog()).filter((e) => e.entity === "ai_outage");
    expect(audit).toHaveLength(2);
    expect(audit[1].after).toMatchObject({ status: "up" });

    // 稼働中の成功は何も記録しない
    expect((await recordInferenceSuccess()).recovered).toBe(false);
    expect((await getAuditLog()).filter((e) => e.entity === "ai_outage")).toHaveLength(2);
  });

  it("失敗→成功→失敗 は連続に数えない（成功で0に戻る）", async () => {
    for (let i = 0; i < AI_OUTAGE_THRESHOLD - 1; i += 1) await recordInferenceFailure();
    await recordInferenceSuccess();
    const r = await recordInferenceFailure();
    expect(r.opened).toBe(false);
    expect(await currentOutage()).toBeNull();
  });

  it("教材の設定が無ければ講師への案内だけ（A-1c）、あればリンクも出す（A-1a）", () => {
    expect(staticMaterial()).toBeNull();
    process.env.STATIC_MATERIAL_URL = "https://example.com/materials/step03";
    expect(staticMaterial()).toEqual({ url: "https://example.com/materials/step03", title: "教材" });
    process.env.STATIC_MATERIAL_TITLE = "STEP03 業務を観察する";
    expect(staticMaterial()?.title).toBe("STEP03 業務を観察する");
  });
});
