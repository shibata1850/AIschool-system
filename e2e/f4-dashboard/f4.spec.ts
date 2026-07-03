import { expect, test, type Page } from "@playwright/test";

/**
 * F4 学習ログ・到達度ダッシュボードのE2E（docs/テスト計画書.md 3章 F4）。
 * 入力エラー系（重みの検証）は閲覧系画面のため単体テストで担保
 * （src/lib/f4/__tests__/achievement.test.ts）。
 */

async function setRole(page: Page, role: "student" | "teacher") {
  await page.context().addCookies([
    { name: "role", value: role, domain: "localhost", path: "/" },
  ]);
}

test.beforeEach(async ({ request }) => {
  await request.post("/api/dev/reset");
});

test("F4-N1 正常系: 週次レポートに到達度・出席率・提出率が並ぶ", async ({ page }) => {
  await setRole(page, "teacher");
  await page.goto("/teacher/report");
  await expect(
    page.getByRole("heading", { name: "週次到達度レポート" }),
  ).toBeVisible();
  const demoRow = page.getByRole("row").filter({ hasText: "デモ生徒01" });
  await expect(demoRow).toBeVisible();
  await expect(demoRow).toContainText("%");
});

test("F4-N2 正常系: 受講生の提出がモニタリングのタイルに反映される", async ({
  page,
}) => {
  // 提出前: 未着手（灰）
  await setRole(page, "teacher");
  await page.goto("/teacher/monitor");
  const tile = page.getByLabel("座席1 デモ生徒01");
  await expect(tile).toContainText("未着手");

  // 受講生が提出する
  await setRole(page, "student");
  await page.goto("/exercises/a1");
  await page.getByLabel("プロンプト本文").fill("メロンパンの紹介文を書いて。");
  await page.getByRole("button", { name: "提出する" }).click();
  await expect(page.getByLabel("状態")).toContainText("AI採点済");

  // タイルの状態が変わる
  await setRole(page, "teacher");
  await page.goto("/teacher/monitor");
  await expect(tile).toContainText("AI採点済");
});

test("F4-E1 例外: 計測不能週は「記録がありません」と表示され0点にならない", async ({
  page,
}) => {
  await setRole(page, "student");
  await page.goto("/achievement");
  const missingWeek = page.getByLabel("2026-10-12の週");
  await expect(missingWeek).toContainText("この週は記録がありません");
  await expect(missingWeek).not.toContainText("到達度 0");
});

test("F4-E2 例外: 出席・未提出の受講生がモニタリングで区別される", async ({
  page,
}) => {
  await setRole(page, "teacher");
  await page.goto("/teacher/monitor");
  await expect(page.getByLabel("座席2 デモ生徒02")).toContainText("出席・未提出");
});

test("F4-P1 権限系: 受講生がモニタリング・レポートのURLを直接開くと403", async ({
  page,
}) => {
  await setRole(page, "student");
  const monitor = await page.goto("/teacher/monitor");
  expect(monitor?.status()).toBe(403);
  const report = await page.goto("/teacher/report");
  expect(report?.status()).toBe(403);
});

test("F4-B1 境界値: 途中入会の受講生は在籍週のみでレポートされる", async ({
  page,
}) => {
  await setRole(page, "teacher");
  await page.goto("/teacher/report");
  // s03 は最新週のみ在籍（fixtures）。到達度がその週の値（88*0.6+100*0.2+100*0.2=92.8）
  const row = page.getByRole("row").filter({ hasText: "デモ生徒03" });
  await expect(row).toContainText("92.8");
});
