import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { recordAudit } from "@/lib/audit/log";
import { getDb } from "@/lib/db/client";
import { aiHealth } from "@/lib/db/schema";

/**
 * AI講師の停止検知と静的教材モードへの切替（受け入れ基準 F2②・未決#14）。
 *
 * **決まったこと（2026-09-04 柴田さま）**: 方式A-1a＋A-1c の併用。
 * 推論が止まったら受講生の画面に「AI講師は今使えません」と出し、
 * 教材へのリンク（設定があれば）と「講師に聞いてください」を案内する。
 * 小テスト・動画の視聴管理は eラーニング側の範囲（CLAUDE.md 13.1）なので出さない。
 *
 * **仕組み**（いわゆるサーキットブレーカー）:
 * - 推論の失敗（例外・サーバー側10秒タイムアウト）を数え、**3回連続**で停止中にする
 * - 停止中は推論を呼ばずに即座に静的教材モードを返す（16人全員を10秒ずつ待たせない）
 * - ただし一定間隔（既定60秒）で**1件だけ**推論を試し、成功したら復旧する
 * - 入力エラー（400）・フィルタでのブロック・受講生自身の中断は失敗に数えない
 * - 停止・復旧は監査ログに残し、停止時は講師へCanvasメッセージで通知する
 *
 * 状態はDBの1行（ai_health）。コンテナが複数でも1つの判断になる。
 */

/** 何回連続で失敗したら停止中にするか */
export const AI_OUTAGE_THRESHOLD = 3;

/**
 * 停止中に推論を再試行する間隔（ミリ秒）。E2Eでは 0 にして即時復旧を試せるようにする。
 * 0 は「絞らない」の意味で、同時に来た2件の排他までは保証しない（時刻の比較なので
 * ミリ秒が1つ違えば両方通る）。本番の60秒では実害がない — 目的は排他ではなく、
 * 停止中に全員を10秒ずつ待たせないための絞りだから
 */
export function probeIntervalMs(): number {
  const raw = process.env.AI_OUTAGE_PROBE_INTERVAL_MS;
  if (raw === undefined || raw === "") return 60_000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 60_000;
}

/** 停止時に案内する教材（A-1a）。URL未設定なら講師への案内だけ（A-1c） */
export interface StaticMaterial {
  url: string;
  title: string;
}

export function staticMaterial(): StaticMaterial | null {
  const url = process.env.STATIC_MATERIAL_URL?.trim();
  if (!url) return null;
  const title = process.env.STATIC_MATERIAL_TITLE?.trim() || "教材";
  return { url, title };
}

/** 受講生の画面へ返す停止情報（内部の通知状況などは含めない） */
export interface OutageInfo {
  /** 停止開始（ISO 8601） */
  since: string;
  material: StaticMaterial | null;
}

export interface AiHealthState {
  consecutiveFailures: number;
  outageStartedAt: Date | null;
  lastAttemptAt: Date | null;
  notifiedAt: Date | null;
  notifySkippedReason: string | null;
}

async function ensureRow(): Promise<void> {
  const db = getDb();
  await db.insert(aiHealth).values({ id: 1 }).onConflictDoNothing();
}

export async function getAiHealth(): Promise<AiHealthState> {
  const db = getDb();
  let [row] = await db.select().from(aiHealth).where(eq(aiHealth.id, 1)).limit(1);
  if (!row) {
    await ensureRow();
    [row] = await db.select().from(aiHealth).where(eq(aiHealth.id, 1)).limit(1);
  }
  return {
    consecutiveFailures: row.consecutiveFailures,
    outageStartedAt: row.outageStartedAt,
    lastAttemptAt: row.lastAttemptAt,
    notifiedAt: row.notifiedAt,
    notifySkippedReason: row.notifySkippedReason,
  };
}

/** 停止中なら受講生向けの情報を返す。稼働中は null */
export async function currentOutage(): Promise<OutageInfo | null> {
  const state = await getAiHealth();
  if (!state.outageStartedAt) return null;
  return { since: state.outageStartedAt.toISOString(), material: staticMaterial() };
}

/**
 * 推論を呼んでよいか。
 * - 稼働中: 呼ぶ
 * - 停止中: 前回の再試行から間隔が空いていれば**この1件だけ**呼ぶ（他は静的教材モード）
 *
 * 再試行の枠は UPDATE ... WHERE で取り合うので、同時に来ても1件しか通らない。
 */
export async function shouldAttemptInference(): Promise<
  { attempt: true; probing: boolean } | { attempt: false; outage: OutageInfo }
> {
  const state = await getAiHealth();
  if (!state.outageStartedAt) return { attempt: true, probing: false };

  const db = getDb();
  const cutoff = new Date(Date.now() - probeIntervalMs());
  const claimed = await db
    .update(aiHealth)
    .set({ lastAttemptAt: new Date() })
    .where(
      and(
        eq(aiHealth.id, 1),
        or(isNull(aiHealth.lastAttemptAt), lt(aiHealth.lastAttemptAt, cutoff)),
        // 復旧と同時に来た場合は下の条件で外れ、通常経路（次回）に回る
        sql`${aiHealth.outageStartedAt} IS NOT NULL`,
      ),
    )
    .returning({ id: aiHealth.id });
  if (claimed.length > 0) return { attempt: true, probing: true };

  return {
    attempt: false,
    outage: { since: state.outageStartedAt.toISOString(), material: staticMaterial() },
  };
}

/**
 * 推論成功。連続失敗を0に戻し、停止中なら復旧させる。
 * 復旧したときだけ監査ログに残す（通常の成功では何も書かない）。
 */
export async function recordInferenceSuccess(): Promise<{ recovered: boolean }> {
  const db = getDb();
  await ensureRow();
  const now = new Date();

  // 復旧の判定と更新を1文で行う（同時に成功が2件来ても、復旧の記録は1件だけ）。
  // RETURNING は更新後の値なので、停止開始時刻は SQL 側で更新前の値を返す
  const recoveredRows = await db.execute<{ since: string }>(sql`
    UPDATE ai_health AS h
       SET consecutive_failures = 0,
           outage_started_at = NULL,
           last_attempt_at = NULL,
           notified_at = NULL,
           notify_skipped_reason = NULL
      FROM (SELECT outage_started_at FROM ai_health WHERE id = 1 FOR UPDATE) AS prev
     WHERE h.id = 1 AND h.outage_started_at IS NOT NULL
 RETURNING prev.outage_started_at AS since
  `);
  const recovered = recoveredRows.rows[0];
  if (!recovered) {
    // 停止中ではなかった: 連続失敗だけ戻す（何も書かない通常経路）
    await db
      .update(aiHealth)
      .set({ consecutiveFailures: 0 })
      .where(and(eq(aiHealth.id, 1), sql`${aiHealth.consecutiveFailures} <> 0`));
    return { recovered: false };
  }

  await recordAudit({
    actorRole: "system",
    action: "update",
    entity: "ai_outage",
    entityId: "ai-tutor",
    before: { status: "down", since: new Date(recovered.since).toISOString() },
    after: { status: "up", recoveredAt: now.toISOString() },
  });
  return { recovered: true };
}

/**
 * 推論失敗。連続失敗を1増やし、閾値に達したら停止中にする。
 * 停止中への切替は1件しか勝てない（`outage_started_at IS NULL` を条件に更新）ので、
 * 講師通知は `opened: true` を受け取った呼び出し側だけが行う。
 */
export async function recordInferenceFailure(): Promise<{
  opened: boolean;
  outage: OutageInfo | null;
}> {
  const db = getDb();
  await ensureRow();
  const [row] = await db
    .update(aiHealth)
    .set({ consecutiveFailures: sql`${aiHealth.consecutiveFailures} + 1` })
    .where(eq(aiHealth.id, 1))
    .returning();

  if (row.outageStartedAt) {
    return {
      opened: false,
      outage: { since: row.outageStartedAt.toISOString(), material: staticMaterial() },
    };
  }
  if (row.consecutiveFailures < AI_OUTAGE_THRESHOLD) {
    return { opened: false, outage: null };
  }

  const now = new Date();
  const opened = await db
    .update(aiHealth)
    .set({ outageStartedAt: now, lastAttemptAt: now })
    .where(and(eq(aiHealth.id, 1), isNull(aiHealth.outageStartedAt)))
    .returning({ outageStartedAt: aiHealth.outageStartedAt });

  if (opened.length === 0) {
    // 同時に別のリクエストが停止中へ切り替えた
    const state = await getAiHealth();
    return {
      opened: false,
      outage: state.outageStartedAt
        ? { since: state.outageStartedAt.toISOString(), material: staticMaterial() }
        : null,
    };
  }

  // 停止は「システムが自動で行った更新」として記録する（操作者なし）
  await recordAudit({
    actorRole: "system",
    action: "update",
    entity: "ai_outage",
    entityId: "ai-tutor",
    before: { status: "up" },
    after: { status: "down", since: now.toISOString(), failures: row.consecutiveFailures },
  });
  return { opened: true, outage: { since: now.toISOString(), material: staticMaterial() } };
}

/** 講師通知の結果を記録する（通知は notifyOutage.ts が行う） */
export async function recordOutageNotification(
  result: { state: "sent" } | { state: "skipped" | "error"; reason: string },
): Promise<void> {
  const db = getDb();
  await db
    .update(aiHealth)
    .set(
      result.state === "sent"
        ? { notifiedAt: new Date(), notifySkippedReason: null }
        : { notifiedAt: null, notifySkippedReason: result.reason },
    )
    .where(and(eq(aiHealth.id, 1), sql`${aiHealth.outageStartedAt} IS NOT NULL`));
}
