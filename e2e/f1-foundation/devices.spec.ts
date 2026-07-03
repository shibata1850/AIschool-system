import { expect, test } from "@playwright/test";
import { resetStore, setRole } from "../helpers";

/**
 * S9 デバイス割当のE2E（F1基盤・docs/画面仕様書.md S9）。
 * 4パス: 正常系 / 入力エラー系 / 権限系 / 境界値
 */

test.beforeEach(async ({ request }) => {
  await resetStore(request);
});

test("S9-N1 正常系: 予備機へ切替でき、監査ログに記録される", async ({ page }) => {
  await setRole(page, "teacher");
  await page.goto("/teacher/devices");

  const seat1 = page.getByLabel("座席1の割当");
  await expect(seat1).toContainText("GOOVIS-01");
  await expect(seat1).not.toContainText("予備機（モバイルモニター）");

  await seat1.getByRole("button", { name: "予備機に切替" }).click();
  await expect(seat1).toContainText("予備機（モバイルモニター）");
  await expect(seat1.getByRole("button", { name: "GOOVISに戻す" })).toBeVisible();

  // 切替が監査ログに記録される（管理者で確認）
  await setRole(page, "admin");
  await page.goto("/admin/audit");
  await expect(page.locator("body")).toContainText("device_assignment / seat-1");
});

test("S9-E1 入力エラー: usingBackupが真偽値でないと400", async ({ request }) => {
  const res = await request.post("/api/devices/1/backup", {
    data: { usingBackup: "yes" },
    headers: { cookie: "role=teacher" },
  });
  expect(res.status()).toBe(400);
});

test("S9-P1 権限系: 受講生・ゲストの切替APIは403", async ({ request }) => {
  for (const role of ["student", "guest"]) {
    const res = await request.post("/api/devices/1/backup", {
      data: { usingBackup: true },
      headers: { cookie: `role=${role}` },
    });
    expect(res.status()).toBe(403);
  }
});

test("S9-B1 境界値: 座席16は切替でき、座席17は404", async ({ request }) => {
  const ok = await request.post("/api/devices/16/backup", {
    data: { usingBackup: true },
    headers: { cookie: "role=teacher" },
  });
  expect(ok.status()).toBe(200);

  const notFound = await request.post("/api/devices/17/backup", {
    data: { usingBackup: true },
    headers: { cookie: "role=teacher" },
  });
  expect(notFound.status()).toBe(404);
});
