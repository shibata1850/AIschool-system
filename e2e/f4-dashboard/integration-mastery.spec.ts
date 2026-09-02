import { expect, test } from "@playwright/test";
import { INTEGRATION_TOKEN, integrationHeaders, resetStore, setRole } from "../helpers";

/**
 * E7-b（単元マスタ参照API）・E7-c（自宅学習の到達度の受信とS5表示）のE2E。
 * 先方要件定義書の受け入れ基準 B-7「到達度スコアがクラウドキャンパス側に反映されること」に対応。
 *
 * 4パス: 正常系 / 入力エラー系 / 権限系 / 境界値
 *
 * **設計上の要点（2026-09-02 柴田さま「到達度は一つに絞る」で方針変更）**:
 * 受け取った自宅学習の到達度は、教室の到達度と**合成して1つの数字にする**
 * （教室8割＋自宅学習2割）。内訳は必ず併記する（先方 受け入れ基準B-3「算出根拠が
 * 本人に確認できること」）。**記録が無い受講生は減点しない**（重みを教室へ再配分）。
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

test("E7-N2 正常系: 到達度を受信し、S5の内訳と算出根拠に表示される", async ({
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
  const section = page.getByLabel("自宅学習の内訳");
  await expect(section).toBeVisible();
  await expect(section).toContainText("到達度 72");
  // 算出根拠が本人に見えること（先方 受け入れ基準 B-3）
  await expect(section).toContainText("第2章の誤答が多い");
});

/** S5の「今の到達度」から、合成後の値と内訳（教室・自宅学習）を読み取る */
async function readAchievement(page: import("@playwright/test").Page) {
  const text = (await page.getByLabel("今の到達度").innerText()).replace(/\s+/g, " ");
  const total = Number(/到達度: ([\d.]+)/.exec(text)?.[1]);
  const classroom = Number(/教室での学習 ([\d.]+)/.exec(text)?.[1]);
  const home = /自宅学習 ([\d.]+)/.exec(text)?.[1];
  return { text, total, classroom, home: home === undefined ? null : Number(home) };
}

test("E7-N3 正常系: 教室8割＋自宅学習2割で合成し、1つの到達度として出す", async ({
  page,
  request,
}) => {
  await request.post("/api/integration/mastery", {
    headers: integrationHeaders(),
    data: { items: [{ studentId: STUDENT, unitId: "a1", score: 30, measuredAt: MEASURED_AT }] },
  });

  await setRole(page, "student");
  await page.goto("/achievement");

  const { total, classroom, home } = await readAchievement(page);
  expect(home).toBe(30);
  // 合成式そのものを固定する（重みを変えたらこのテストが落ちる）
  expect(total).toBeCloseTo(Math.round((classroom * 0.8 + 30 * 0.2) * 10) / 10, 5);
  // 内訳を出さないと合成後の数字の意味が説明できない（先方 受け入れ基準B-3）
  await expect(page.getByLabel("今の到達度")).toContainText("内訳");
});

test("E7-N5 正常系: 自宅学習の記録が無い受講生を減点しない（重みを教室へ再配分）", async ({
  page,
}) => {
  await setRole(page, "student");
  await page.goto("/achievement");

  const { total, classroom, home } = await readAchievement(page);
  expect(home).toBeNull();
  // 教室の到達度がそのまま全体になる（classroom * 0.8 にしない）
  expect(total).toBe(classroom);
  await expect(page.getByLabel("今の到達度")).toContainText("自宅学習はまだ記録がありません");
});

test("E7-N6 正常系: 講師の週次レポートにも受講生本人と同じ到達度が出る", async ({
  page,
  request,
}) => {
  await request.post("/api/integration/mastery", {
    headers: integrationHeaders(),
    data: { items: [{ studentId: STUDENT, unitId: "a1", score: 100, measuredAt: MEASURED_AT }] },
  });

  await setRole(page, "student");
  await page.goto("/achievement");
  const { total } = await readAchievement(page);

  // 画面ごとに違う到達度が出ると講師が混乱する
  await setRole(page, "teacher");
  await page.goto("/teacher/report");
  await expect(page.getByRole("table")).toContainText(String(total));
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
  const section = page.getByLabel("自宅学習の内訳");
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
  await expect(page.getByLabel("自宅学習の内訳")).toBeHidden();
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
  await expect(page.getByLabel("自宅学習の内訳")).toBeHidden();
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
    const section = page.getByLabel("自宅学習の内訳");
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
  const section = page.getByLabel("自宅学習の内訳");
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

test("E7-B4 境界値: 受信が無ければ「自宅学習の内訳」欄そのものを出さない", async ({
  page,
}) => {
  await setRole(page, "student");
  await page.goto("/achievement");
  await expect(page.getByLabel("週ごとの記録（教室）")).toBeVisible();
  await expect(page.getByLabel("自宅学習の内訳")).toBeHidden();
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
  await expect(page.getByLabel("自宅学習の内訳")).toBeHidden();
});

test("E7-S1 トークンは応答に漏れない", async ({ request }) => {
  const res = await request.get("/api/integration/units", {
    headers: integrationHeaders("another-wrong-token-0123456789abcdef"),
  });
  expect(await res.text()).not.toContain(INTEGRATION_TOKEN);
});
