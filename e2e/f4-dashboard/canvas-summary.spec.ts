import { expect, test } from "@playwright/test";
import { setRole } from "../helpers";

/**
 * クラス成績サマリ（app/teacher/summary・B-4）。
 * E2E環境はCanvas未設定のためデモモード表示。実集計はステージングで確認する。
 */
test.describe("クラス成績サマリ（デモモード）", () => {
  test("講師はデモモードの案内を見られる（未接続時）", async ({ page }) => {
    await setRole(page, "teacher");
    await page.goto("/teacher/summary");
    await expect(
      page.getByRole("heading", { name: "クラス成績サマリ（Canvas）" }),
    ).toBeVisible();
    await expect(page.getByText("いまはデモモードです（Canvas未接続）")).toBeVisible();
  });

  test("本文フォントが16px以上（GOOVIS制約）", async ({ page }) => {
    await setRole(page, "teacher");
    await page.goto("/teacher/summary");
    const fontSize = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.body).fontSize),
    );
    expect(fontSize).toBeGreaterThanOrEqual(16);
  });
});
