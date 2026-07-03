import { expect, test } from "@playwright/test";
import { resetStore, setRole } from "../helpers";

/**
 * SEC-4 監査ログ（docs/テスト計画書.md 3章）:
 * 提出・成績確定の操作が監査ログに記録され、管理者が閲覧できる。
 */

test.beforeEach(async ({ request }) => {
  await resetStore(request);
});

test("SEC-4: 提出と成績確定が監査ログに記録され管理者が閲覧できる", async ({
  page,
}) => {
  // 受講生が提出する（update: 提出）
  await setRole(page, "student");
  await page.goto("/exercises/a1");
  await page.getByLabel("プロンプト本文").fill("メロンパンの紹介文を書いて。");
  await page.getByRole("button", { name: "提出する" }).click();
  await expect(page.getByLabel("状態")).toContainText("AI採点済");

  // 講師が完了にする（update: 成績確定）
  await setRole(page, "teacher");
  await page.goto("/teacher/review");
  await page.getByRole("button", { name: "完了にする" }).click();
  await expect(page.getByText("採点待ちの提出はありません")).toBeVisible();

  // 管理者が監査ログを閲覧できる（操作者・変更前後が見える）
  await setRole(page, "admin");
  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "監査ログ" })).toBeVisible();
  const rows = page.getByRole("row");
  await expect(rows.filter({ hasText: "student" }).first()).toBeVisible();
  await expect(rows.filter({ hasText: "teacher" }).first()).toBeVisible();
  await expect(rows.filter({ hasText: "system" }).first()).toBeVisible(); // AI採点の記録
  await expect(page.locator("body")).toContainText("completed");
});
