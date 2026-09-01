import { expect, test } from "@playwright/test";
import { INTEGRATION_TOKEN, integrationHeaders, resetStore, setRole } from "../helpers";

/**
 * E7-b（単元マスタ参照API）・E7-c（自宅学習の到達度の受信とS5表示）のE2E。
 * 先方要件定義書の受け入れ基準 B-7「到達度スコアがクラウドキャンパス側に反映されること」に対応。
 *
 * 4パス: 正常系 / 入力エラー系 / 権限系 / 境界値
 *
 * **設計上の要点**: 受け取った自宅学習の到達度は、教室の到達度と**合成しない**。
 * 別セクションとして並べる（docs/eラーニング連携.md 3.2.2）。
 */

const MEASURED_AT = "2026-09-01T00:00:00.000Z";
/** デモ運用でログイン中の受講生ID（src/lib/auth.ts）。表示まで確認するテストはこのIDへ送る */
const STUDENT = "student-demo";

test.beforeEach(async ({ request }) => {
  await resetStore(request);
});

// ---------- 正常系 ----------

test("E7-N1 正常系: 単元マスタを参照できる（E7-b）", async ({ request }) => {
  const res = await request.get("/api/integration/units", {
    headers: integrationHeaders(),
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body.units)).toBe(true);
  expect(body.units.length).toBeGreaterThan(0);
  // 相手が到達度を送るのに必要な最小限が入っていること
  expect(body.units[0]).toHaveProperty("id");
  expect(body.units[0]).toHaveProperty("title");
});

test("E7-N2 正常系: 到達度を受信し、S5に「自宅学習の到達度」として表示される", async ({
  page,
  request,
}) => {
  const post = await request.post("/api/integration/mastery", {
    headers: integrationHeaders(),
    data: {
      items: [
        {
          studentId: STUDENT,
          unitId: "a1",
          score: 72,
          reasons: ["第2章の誤答が多い"],
          measuredAt: MEASURED_AT,
        },
      ],
    },
  });
  expect(post.status()).toBe(200);
  expect((await post.json()).accepted).toBe(1);

  await setRole(page, "student");
  await page.goto("/achievement");
  const section = page.getByLabel("自宅学習の到達度");
  await expect(section).toBeVisible();
  await expect(section).toContainText("到達度 72");
  // 算出根拠が本人に見えること（先方 受け入れ基準 B-3）
  await expect(section).toContainText("第2章の誤答が多い");
});

test("E7-N3 正常系: 教室の到達度と合成せず、別々に表示する", async ({ page, request }) => {
  await request.post("/api/integration/mastery", {
    headers: integrationHeaders(),
    data: { items: [{ studentId: STUDENT, unitId: "a1", score: 30, measuredAt: MEASURED_AT }] },
  });

  await setRole(page, "student");
  await page.goto("/achievement");

  // 教室側のセクションは自宅学習の値に影響されない（合成していない証拠）
  await expect(page.getByLabel("週ごとの記録（教室）")).toBeVisible();
  await expect(page.getByLabel("自宅学習の到達度")).toContainText("到達度 30");
  await expect(page.getByLabel("自宅学習の到達度")).toContainText("合算していません");
});

test("E7-N4 正常系: 同じ受講生・同じ単元の再送は上書きされる（重複して増えない）", async ({
  page,
  request,
}) => {
  for (const score of [40, 85]) {
    const res = await request.post("/api/integration/mastery", {
      headers: integrationHeaders(),
      data: { items: [{ studentId: STUDENT, unitId: "a1", score, measuredAt: MEASURED_AT }] },
    });
    expect(res.status()).toBe(200);
  }

  await setRole(page, "student");
  await page.goto("/achievement");
  const section = page.getByLabel("自宅学習の到達度");
  await expect(section).toContainText("到達度 85");
  await expect(section).not.toContainText("到達度 40");
});

// ---------- 入力エラー系 ----------

test("E7-E1 入力エラー: 未知の単元IDは409で差し戻す（マスタの正はこちら）", async ({
  request,
}) => {
  const res = await request.post("/api/integration/mastery", {
    headers: integrationHeaders(),
    data: {
      items: [{ studentId: "s1", unitId: "存在しない単元", score: 50, measuredAt: MEASURED_AT }],
    },
  });
  expect(res.status()).toBe(409);
  const body = await res.json();
  expect(body.unknownUnitIds).toContain("存在しない単元");
});

test("E7-E2 入力エラー: 不正な項目は400で、何が悪いかを項目ごとに返す", async ({ request }) => {
  const res = await request.post("/api/integration/mastery", {
    headers: integrationHeaders(),
    data: { items: [{ studentId: "s1", unitId: "a1", score: 999, measuredAt: MEASURED_AT }] },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.details[0].field).toBe("score");
});

test("E7-E3 入力エラー: 1件でも不正なら全体を拒否し、正しい分も保存しない", async ({
  page,
  request,
}) => {
  const res = await request.post("/api/integration/mastery", {
    headers: integrationHeaders(),
    data: {
      items: [
        { studentId: STUDENT, unitId: "a1", score: 60, measuredAt: MEASURED_AT },
        { studentId: STUDENT, unitId: "a1", score: -5, measuredAt: MEASURED_AT },
      ],
    },
  });
  expect(res.status()).toBe(400);

  // 正しかった1件目も入っていないこと（部分適用しない）
  await setRole(page, "student");
  await page.goto("/achievement");
  await expect(page.getByLabel("自宅学習の到達度")).toBeHidden();
});

// ---------- 権限系 ----------

test("E7-P1 権限系: トークンなしでは単元マスタも到達度APIも叩けない", async ({ request }) => {
  const get = await request.get("/api/integration/units");
  expect(get.status()).toBe(401);

  const post = await request.post("/api/integration/mastery", {
    data: { items: [{ studentId: "s1", unitId: "a1", score: 50, measuredAt: MEASURED_AT }] },
  });
  expect(post.status()).toBe(401);
});

test("E7-P2 権限系: 誤ったトークンは401", async ({ request }) => {
  const res = await request.get("/api/integration/units", {
    headers: integrationHeaders("wrong-token-0123456789abcdefghijklmnop"),
  });
  expect(res.status()).toBe(401);
});

test("E7-P3 権限系: ロールCookieでは連携APIを通過できない（人の権限とは別系統）", async ({
  request,
}) => {
  for (const role of ["student", "teacher", "admin"]) {
    const res = await request.get("/api/integration/units", {
      headers: { cookie: `role=${role}` },
    });
    expect(res.status()).toBe(401);
  }
});

test("E7-P4 権限系: 受講生は他人の自宅学習到達度を見られない", async ({ page, request }) => {
  await request.post("/api/integration/mastery", {
    headers: integrationHeaders(),
    data: { items: [{ studentId: "s2", unitId: "a1", score: 91, measuredAt: MEASURED_AT }] },
  });

  // s1 としてログインしても、s2 宛の値は出ない
  await setRole(page, "student");
  await page.goto("/achievement");
  await expect(page.getByLabel("自宅学習の到達度")).toBeHidden();
});

// ---------- 境界値 ----------

test("E7-B1 境界値: 0点と100点を受理し、そのまま表示する", async ({ page, request }) => {
  await setRole(page, "student");

  // 単元マスタ（最小シード）は a1 のみのため、上下限を順に送って確認する
  for (const [score, shown] of [
    [0, "到達度 0"],
    [100, "到達度 100"],
  ] as const) {
    const res = await request.post("/api/integration/mastery", {
      headers: integrationHeaders(),
      data: { items: [{ studentId: STUDENT, unitId: "a1", score, measuredAt: MEASURED_AT }] },
    });
    expect(res.status()).toBe(200);

    await page.goto("/achievement");
    const section = page.getByLabel("自宅学習の到達度");
    await expect(section).toContainText(shown);
    // 0点は「測定中」ではない（score:null と取り違えていないこと）
    await expect(section).not.toContainText("測定中");
  }
});

test("E7-B2 境界値: score が null なら「測定中」と表示し、0点として見せない", async ({
  page,
  request,
}) => {
  const res = await request.post("/api/integration/mastery", {
    headers: integrationHeaders(),
    data: {
      items: [{ studentId: STUDENT, unitId: "a1", score: null, measuredAt: MEASURED_AT }],
    },
  });
  expect(res.status()).toBe(200);

  await setRole(page, "student");
  await page.goto("/achievement");
  const section = page.getByLabel("自宅学習の到達度");
  await expect(section).toContainText("測定中");
  await expect(section).not.toContainText("到達度 0");
});

test("E7-B3 境界値: 空の items は400", async ({ request }) => {
  const res = await request.post("/api/integration/mastery", {
    headers: integrationHeaders(),
    data: { items: [] },
  });
  expect(res.status()).toBe(400);
});

test("E7-B4 境界値: 受信が無ければ「自宅学習の到達度」欄そのものを出さない", async ({
  page,
}) => {
  await setRole(page, "student");
  await page.goto("/achievement");
  await expect(page.getByLabel("週ごとの記録（教室）")).toBeVisible();
  await expect(page.getByLabel("自宅学習の到達度")).toBeHidden();
});

// ---------- 監査・削除 ----------

test("E7-A1 受信は監査ログに残る（氏名は残さない）", async ({ page, request }) => {
  await request.post("/api/integration/mastery", {
    headers: integrationHeaders(),
    data: { items: [{ studentId: "s1", unitId: "a1", score: 55, measuredAt: MEASURED_AT }] },
  });

  await setRole(page, "admin");
  await page.goto("/admin/audit");
  await expect(page.getByText("external_mastery").first()).toBeVisible();
});

test("E7-A2 退会者データの削除で、自宅学習の到達度も消える", async ({ page, request }) => {
  await request.post("/api/integration/mastery", {
    headers: integrationHeaders(),
    data: { items: [{ studentId: STUDENT, unitId: "a1", score: 55, measuredAt: MEASURED_AT }] },
  });

  const purge = await request.post("/api/admin/retention/purge", {
    headers: { cookie: "role=admin" },
    data: {
      confirm: true,
      withdrawals: [{ studentId: STUDENT, withdrawnAt: "2020-01-01" }],
    },
  });
  expect(purge.status()).toBe(200);
  const purged = await purge.json();
  expect(purged.purgedCount).toBe(1);
  expect(purged.purged[0].deletedExternalMastery).toBe(1);

  await setRole(page, "student");
  await page.goto("/achievement");
  await expect(page.getByLabel("自宅学習の到達度")).toBeHidden();
});

test("E7-S1 トークンは応答に漏れない", async ({ request }) => {
  const res = await request.get("/api/integration/units", {
    headers: integrationHeaders("another-wrong-token-0123456789abcdef"),
  });
  expect(await res.text()).not.toContain(INTEGRATION_TOKEN);
});
