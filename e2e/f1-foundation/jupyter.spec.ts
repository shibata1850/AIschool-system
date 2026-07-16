import { expect, test } from "@playwright/test";
import { setRole } from "../helpers";

/**
 * S4 Jupyter演習の画面。E2E環境は JUPYTERHUB_URL 未設定のため「準備中」表示になる。
 * 接続時（URL設定時）の導線はステージングで確認する（docs/JupyterHub構築手順.md）。
 */
test.describe("S4 Jupyter演習（未設定＝準備中）", () => {
  test("受講生に準備中の案内が表示される", async ({ page }) => {
    await setRole(page, "student");
    await page.goto("/jupyter");
    await expect(page.getByRole("heading", { name: "Jupyter（ジュピター）演習" })).toBeVisible();
    await expect(page.getByText("演習マシン（JupyterHub）は、まだ準備中です")).toBeVisible();
  });

  test("ゲストは演習ページに入れない（403）", async ({ page }) => {
    await setRole(page, "guest");
    const res = await page.goto("/jupyter");
    expect(res?.status()).toBe(403);
  });
});
