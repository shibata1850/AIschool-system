import { expect, test } from "@playwright/test";

/**
 * 開発基盤のスモークテスト（S1 受講生ホームの骨格）。
 * 機能実装（F1〜F4）のE2Eは各機能のコミットで追加する。
 */
test.describe("S1 受講生ホーム（骨格）", () => {
  test("トップページに「きょうやること」が表示される", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "きょうやること" }),
    ).toBeVisible();
  });

  test("UIテキストが日本語である（lang=ja）", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  });

  test("本文フォントが16px以上（GOOVIS制約）", async ({ page }) => {
    await page.goto("/");
    const fontSize = await page
      .locator("body")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);
  });
});
