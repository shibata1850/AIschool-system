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
  await expect(seat1).toContainText("MON-01");
  await expect(seat1).toContainText("主モニター");

  await seat1.getByRole("button", { name: "予備機に切替" }).click();
  await expect(seat1.getByRole("button", { name: "主モニターに戻す" })).toBeVisible();

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

/**
 * 座席への受講生割当（2026-09-04追加）。
 *
 * **なぜ要るか**: 名簿をLTI起動の記録から作るようにした（0007）あとも、座席の
 * 割当表は初期データの架空IDのままで、実受講生の座席番号が 0 になっていた。
 * 開講日に「16台がそれぞれ別の受講生として見える」状態を講師が画面から作れること。
 */
test("S9-N2 正常系: 座席の受講生を変更でき、監査ログに記録される", async ({ page }) => {
  await setRole(page, "teacher");
  await page.goto("/teacher/devices");

  const seat2 = page.getByLabel("座席2の割当");
  // 座席2の受講生を、座席1に居る「デモ生徒01」へ付け替える
  await seat2.getByLabel("座席2の受講生").selectOption({ label: "デモ生徒01" });
  await seat2.getByRole("button", { name: "保存" }).click();
  await expect(seat2.getByText("保存しました")).toBeVisible();
  await expect(seat2).toContainText("デモ生徒01");

  // 同じ受講生は2席に居ない — 元の座席1は空席になる
  await expect(page.getByLabel("座席1の割当")).toContainText("空席");

  await setRole(page, "admin");
  await page.goto("/admin/audit");
  await expect(page.locator("body")).toContainText("device_assignment / seat-2");
});

test("S9-N3 正常系: 空席に戻せる", async ({ page, request }) => {
  const res = await request.post("/api/devices/1/student", {
    data: { studentId: null },
    headers: { cookie: "role=teacher" },
  });
  expect(res.status()).toBe(200);

  await setRole(page, "teacher");
  await page.goto("/teacher/devices");
  await expect(page.getByLabel("座席1の割当")).toContainText("空席");
});

test("S9-E2 入力エラー: 名簿にない受講生・型違いは400", async ({ request }) => {
  const notOnRoster = await request.post("/api/devices/1/student", {
    data: { studentId: "存在しないID" },
    headers: { cookie: "role=teacher" },
  });
  expect(notOnRoster.status()).toBe(400);

  const wrongType = await request.post("/api/devices/1/student", {
    data: { studentId: 42 },
    headers: { cookie: "role=teacher" },
  });
  expect(wrongType.status()).toBe(400);

  // 未指定は「空席にする（null）」と区別できないため弾く
  const missing = await request.post("/api/devices/1/student", {
    data: {},
    headers: { cookie: "role=teacher" },
  });
  expect(missing.status()).toBe(400);
});

test("S9-P2 権限系: 受講生・ゲストの割当APIは403", async ({ request }) => {
  for (const role of ["student", "guest"]) {
    const res = await request.post("/api/devices/1/student", {
      data: { studentId: null },
      headers: { cookie: `role=${role}` },
    });
    expect(res.status()).toBe(403);
  }
});

test("S9-B2 境界値: 座席16は割当でき、座席17は404", async ({ request }) => {
  const ok = await request.post("/api/devices/16/student", {
    data: { studentId: "student-demo" },
    headers: { cookie: "role=teacher" },
  });
  expect(ok.status()).toBe(200);

  const notFound = await request.post("/api/devices/17/student", {
    data: { studentId: "student-demo" },
    headers: { cookie: "role=teacher" },
  });
  expect(notFound.status()).toBe(404);
});
