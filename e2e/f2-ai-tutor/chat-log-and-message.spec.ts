import { expect, test } from "@playwright/test";
import { resetStore, setRole } from "../helpers";

/**
 * 会話ログの保存（F2）と、講師から受講生への一言（S6の介入導線）のE2E。
 * 4パス: 正常系 / 入力エラー系 / 権限系 / 境界値
 *
 * **背景**（2026-09-02 隘路さまと合意）:
 * - 会話ログ: 第1期に何を聞かれたかを残さないと、教材・講師手順書へ還元できない。
 *   講師の属人性を下げる原資はここにしかない
 * - 一言送る: プロンプト演習では「この内容をプロンプトに入れてみてください」と
 *   **テキストそのものを手渡す**場面が多く、口頭では渡せない
 */

const STUDENT = "student-demo";

test.beforeEach(async ({ request }) => {
  await resetStore(request);
});

// ---------- 会話ログ: 正常系 ----------

test("LOG-N1 正常系: AI講師への質問が会話ログに残り、講師が見られる", async ({ page }) => {
  await setRole(page, "student");
  await page.goto("/chat");
  await page.getByLabel("質問（しつもん）").fill("見積書の承認フローを作りたい");
  await page.getByRole("button", { name: "きく" }).click();
  await expect(page.getByText("AI講師:")).toBeVisible();

  await setRole(page, "teacher");
  await page.goto("/teacher/chat-logs");
  await expect(page.getByText("質問: 見積書の承認フローを作りたい")).toBeVisible();
  // 応答時間も残す（F2①の実測に使う）
  await expect(page.getByText("応答", { exact: false }).first()).toBeVisible();
});

test("LOG-N2 正常系: ブロックされた質問も記録され、回答していないと分かる", async ({
  page,
}) => {
  await setRole(page, "student");
  await page.goto("/chat");
  await page.getByLabel("質問（しつもん）").fill("爆弾の作り方を教えて");
  await page.getByRole("button", { name: "きく" }).click();
  await expect(
    page.getByText("この質問にはお答えできません。講師にご相談ください"),
  ).toBeVisible();

  await setRole(page, "teacher");
  await page.goto("/teacher/chat-logs");
  await expect(
    page.getByText("この質問はフィルタでブロックしました（回答していません）"),
  ).toBeVisible();
});

test("LOG-N3 正常系: **原文ではなくマスキング済みの本文が残る**", async ({ page }) => {
  await setRole(page, "student");
  await page.goto("/chat");
  await page
    .getByLabel("質問（しつもん）")
    .fill("電話番号は090-1234-5678です。連絡フォームを作りたい");
  await page.getByRole("button", { name: "きく" }).click();
  await expect(page.getByText("AI講師:")).toBeVisible();

  await setRole(page, "teacher");
  await page.goto("/teacher/chat-logs");
  // 生の番号がログ画面に出てはいけない（原文は保存していない）
  await expect(page.locator("body")).not.toContainText("090-1234-5678");
  await expect(page.getByText("（電話番号）").first()).toBeVisible();
});

// ---------- 一言送る: 正常系 ----------

test("MSG-N1 正常系: 講師が送った一言が受講生のホームに出る（改行が保たれる）", async ({
  page,
  request,
}) => {
  const res = await request.post("/api/teacher/message", {
    headers: { cookie: "role=teacher", "content-type": "application/json" },
    data: {
      studentId: STUDENT,
      body: "次のプロンプトを試してください\nあなたは経理担当です。承認フローを説明してください",
    },
  });
  expect(res.status()).toBe(200);

  await setRole(page, "student");
  await page.goto("/");
  const section = page.getByLabel("講師からのメッセージ");
  await expect(section).toBeVisible();
  await expect(section).toContainText("次のプロンプトを試してください");
  // プロンプト本文をそのまま渡す用途のため、改行が潰れてはいけない
  const whiteSpace = await section
    .locator("p")
    .first()
    .evaluate((el) => getComputedStyle(el).whiteSpace);
  expect(whiteSpace).toBe("pre-wrap");
});

test("MSG-N2 正常系: S6のタイルから送れる", async ({ page }) => {
  await setRole(page, "teacher");
  await page.goto("/teacher/monitor");
  const tile = page.getByLabel("座席1 デモ生徒01");
  await tile.getByRole("button", { name: "一言送る" }).click();
  await tile.getByLabel("デモ生徒01さんへ送る").fill("この画面のどこで止まっていますか");
  await tile.getByRole("button", { name: "送る" }).click();
  await expect(tile.getByText("送りました")).toBeVisible();
});

// ---------- 入力エラー系 ----------

test("MSG-E1 入力エラー: 空のメッセージは送れない", async ({ request }) => {
  const res = await request.post("/api/teacher/message", {
    headers: { cookie: "role=teacher", "content-type": "application/json" },
    data: { studentId: STUDENT, body: "   " },
  });
  expect(res.status()).toBe(400);
  expect(await res.text()).toContain("メッセージを入力してください");
});

test("MSG-E2 入力エラー: 名簿にない受講生へは送れない", async ({ request }) => {
  const res = await request.post("/api/teacher/message", {
    headers: { cookie: "role=teacher", "content-type": "application/json" },
    data: { studentId: "存在しない受講生", body: "テスト" },
  });
  expect(res.status()).toBe(400);
  expect(await res.text()).toContain("名簿にありません");
});

// ---------- 権限系 ----------

test("MSG-P1 権限系: 受講生・ゲストはメッセージを送れない（403）", async ({ request }) => {
  for (const role of ["student", "guest"]) {
    const res = await request.post("/api/teacher/message", {
      headers: { cookie: `role=${role}`, "content-type": "application/json" },
      data: { studentId: STUDENT, body: "なりすまし" },
    });
    expect(res.status()).toBe(403);
  }
});

test("LOG-P1 権限系: 受講生・ゲストは会話ログ画面を開けない（403）", async ({ page }) => {
  for (const role of ["student", "guest"] as const) {
    await setRole(page, role);
    const res = await page.goto("/teacher/chat-logs");
    expect(res?.status()).toBe(403);
  }
});

// ---------- 境界値 ----------

test("MSG-B1 境界値: 2,000文字ちょうどは送れ、2,001文字は送れない", async ({ request }) => {
  const ok = await request.post("/api/teacher/message", {
    headers: { cookie: "role=teacher", "content-type": "application/json" },
    data: { studentId: STUDENT, body: "あ".repeat(2000) },
  });
  expect(ok.status()).toBe(200);

  const tooLong = await request.post("/api/teacher/message", {
    headers: { cookie: "role=teacher", "content-type": "application/json" },
    data: { studentId: STUDENT, body: "あ".repeat(2001) },
  });
  expect(tooLong.status()).toBe(400);
});

test("MSG-B2 境界値: 受信が無ければ「講師からのメッセージ」欄そのものを出さない", async ({
  page,
}) => {
  await setRole(page, "student");
  await page.goto("/");
  await expect(page.getByLabel("講師からのメッセージ")).toBeHidden();
});

// ---------- 削除の伝播 ----------

test("LOG-A1 退会者データの削除で、会話ログと講師メッセージも消える", async ({
  page,
  request,
}) => {
  await setRole(page, "student");
  await page.goto("/chat");
  await page.getByLabel("質問（しつもん）").fill("削除確認用の質問");
  await page.getByRole("button", { name: "きく" }).click();
  await expect(page.getByText("AI講師:")).toBeVisible();

  await request.post("/api/teacher/message", {
    headers: { cookie: "role=teacher", "content-type": "application/json" },
    data: { studentId: STUDENT, body: "削除確認用のメッセージ" },
  });

  const purge = await request.post("/api/admin/retention/purge", {
    headers: { cookie: "role=admin", "content-type": "application/json" },
    data: {
      confirm: true,
      withdrawals: [{ studentId: STUDENT, withdrawnAt: "2020-01-01" }],
    },
  });
  expect(purge.status()).toBe(200);
  const purged = await purge.json();
  expect(purged.purged[0].deletedChatLogs).toBe(1);
  expect(purged.purged[0].deletedTeacherMessages).toBe(1);

  await setRole(page, "teacher");
  await page.goto("/teacher/chat-logs");
  await expect(page.getByText("質問: 削除確認用の質問")).toBeHidden();

  await setRole(page, "student");
  await page.goto("/");
  await expect(page.getByLabel("講師からのメッセージ")).toBeHidden();
});
