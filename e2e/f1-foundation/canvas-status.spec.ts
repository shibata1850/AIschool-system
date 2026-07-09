import { expect, test } from "@playwright/test";
import { setRole } from "../helpers";

/**
 * Canvas連携状況画面（app/admin/canvas）。
 * E2E環境ではCANVAS_BASE_URL/TOKENを設定しないため、必ず「デモモード」表示になる。
 * 実接続時の表示（接続成功・コース一覧）はステージング上で確認する
 * （docs/Canvasステージング構築手順.md／infra/canvas/seed-demo-data.sh）。
 */
test.describe("Canvas連携状況（デモモード）", () => {
  test("管理者はデモモードの案内を見られる（未接続時）", async ({ page }) => {
    await setRole(page, "admin");
    await page.goto("/admin/canvas");
    await expect(page.getByRole("heading", { name: "Canvas連携状況" })).toBeVisible();
    await expect(page.getByText("いまはデモモードです（Canvas未接続）")).toBeVisible();
  });

  test("本文フォントが16px以上（GOOVIS制約）", async ({ page }) => {
    await setRole(page, "admin");
    await page.goto("/admin/canvas");
    const fontSize = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.body).fontSize),
    );
    expect(fontSize).toBeGreaterThanOrEqual(16);
  });
});
