import { expect, test } from "@playwright/test";
import { setRole } from "../helpers";

/**
 * クラス名簿（app/teacher/class）。
 * E2E環境はCanvas未設定のため必ずデモモード表示になる。
 * 実接続時の名簿・課題表示はステージングで確認する（seed-demo-data.sh）。
 */
test.describe("クラス名簿（デモモード）", () => {
  test("講師はデモモードの案内を見られる（未接続時）", async ({ page }) => {
    await setRole(page, "teacher");
    await page.goto("/teacher/class");
    await expect(page.getByRole("heading", { name: "クラス名簿" })).toBeVisible();
    await expect(page.getByText("いまはデモモードです（Canvas未接続）")).toBeVisible();
  });

  test("本文フォントが16px以上（GOOVIS制約）", async ({ page }) => {
    await setRole(page, "teacher");
    await page.goto("/teacher/class");
    const fontSize = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.body).fontSize),
    );
    expect(fontSize).toBeGreaterThanOrEqual(16);
  });
});
