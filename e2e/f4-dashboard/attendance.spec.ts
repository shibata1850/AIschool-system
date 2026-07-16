import { expect, test } from "@playwright/test";
import { resetStore, setRole } from "../helpers";

/**
 * 出席記録（app/teacher/attendance と /api/teacher/attendance・未決#11）。
 */
test.beforeEach(async ({ request }) => {
  await resetStore(request);
});

test("講師が出席をつけると保存される（トグルが反映）", async ({ page }) => {
  await setRole(page, "teacher");
  await page.goto("/teacher/attendance");
  await expect(page.getByRole("heading", { name: "出席の記録" })).toBeVisible();
  // 座席1（デモ生徒01）の「欠席」を押す → そのボタンが選択状態になる
  const row = page.getByText("1. デモ生徒01").locator("..");
  const absentBtn = row.getByRole("button", { name: "欠席" });
  await absentBtn.click();
  await expect(absentBtn).toHaveAttribute("aria-pressed", "true");
});

test("権限: 受講生は出席APIを使えない（403）", async ({ request }) => {
  const res = await request.post("/api/teacher/attendance", {
    headers: { cookie: "role=student" },
    data: { studentId: "s02", attended: false },
  });
  expect(res.status()).toBe(403);
});

test("入力検証: attended が真偽値でないと400", async ({ request }) => {
  const res = await request.post("/api/teacher/attendance", {
    headers: { cookie: "role=teacher" },
    data: { studentId: "s02", attended: "yes" },
  });
  expect(res.status()).toBe(400);
});
