import { expect, test, type Page } from "@playwright/test";

/**
 * 回帰テスト（2026-07-03 コード監査の指摘#3・#4）:
 * - 不明な action が「完了」にフォールバックしない
 * - スコア空欄のままの確定が0点にならない
 */

async function setRole(page: Page, role: "student" | "teacher") {
  await page.context().addCookies([
    { name: "role", value: role, domain: "localhost", path: "/" },
  ]);
}

test.beforeEach(async ({ request }) => {
  await request.post("/api/dev/reset", {
    headers: { cookie: "role=teacher" },
  });
});

async function submitAsStudent(page: Page) {
  await setRole(page, "student");
  await page.goto("/exercises/a1");
  await page.getByLabel("プロンプト本文").fill("メロンパンの紹介文を書いて。");
  await page.getByRole("button", { name: "提出する" }).click();
  await expect(page.getByLabel("状態")).toContainText("AI採点済");
}

test("指摘#3: 不明なactionは400で拒否され、提出は完了にならない", async ({
  page,
  request,
}) => {
  await submitAsStudent(page);

  for (const badBody of [{}, { action: "Reject" }, { action: "RETURN" }]) {
    const res = await request.post("/api/submissions/s1/review", {
      data: badBody,
      headers: { cookie: "role=teacher" },
    });
    expect(res.status()).toBe(400);
  }

  // 提出はAI採点済のまま（完了に倒れていない）
  await setRole(page, "teacher");
  await page.goto("/teacher/review");
  await expect(page.getByText("お店の紹介文をAIに書かせよう")).toBeVisible();
});

test("指摘#3: 不正なJSONボディは500ではなく400になる", async ({ page, request }) => {
  await submitAsStudent(page);
  const res = await request.post("/api/submissions/s1/review", {
    headers: { cookie: "role=teacher", "content-type": "application/json" },
    data: "{壊れたJSON",
  });
  expect(res.status()).toBe(400);
});

test("指摘#4: スコアを空欄にしたままの「完了にする」はエラーになり0点確定しない", async ({
  page,
}) => {
  await submitAsStudent(page);

  await setRole(page, "teacher");
  await page.goto("/teacher/review");
  await page.getByLabel(/講師スコア/).fill("");
  await page.getByRole("button", { name: "完了にする" }).click();
  await expect(
    page.getByText("スコアを入力してください（空欄のままでは確定できません）"),
  ).toBeVisible();

  // 提出は完了になっていない（一覧に残っている）
  await page.goto("/teacher/review");
  await expect(page.getByText("お店の紹介文をAIに書かせよう")).toBeVisible();

  // 受講生側も0点になっていない
  await setRole(page, "student");
  await page.goto("/exercises/a1");
  await expect(page.getByLabel("状態")).not.toContainText("完了");
});
