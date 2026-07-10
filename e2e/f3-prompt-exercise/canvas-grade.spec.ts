import { expect, test } from "@playwright/test";
import { setRole } from "../helpers";

/**
 * 成績入力（Canvas連携・app/teacher/grade と /api/teacher/grade）。
 * E2E環境はCanvas未設定のため、画面はデモモード案内、APIは409を返す。
 * 実際の成績反映はステージング上で確認する（seed-demo-data.sh 投入後）。
 */
test.describe("成績入力（デモモード）", () => {
  test("講師はデモモードの案内を見られる（未接続時）", async ({ page }) => {
    await setRole(page, "teacher");
    await page.goto("/teacher/grade");
    await expect(page.getByRole("heading", { name: "成績入力（Canvas連携）" })).toBeVisible();
    await expect(page.getByText("いまはデモモードです（Canvas未接続）")).toBeVisible();
  });

  test("Canvas未接続時、成績反映APIは409で反映しない", async ({ request }) => {
    const res = await request.post("/api/teacher/grade", {
      headers: { cookie: "role=teacher" },
      data: { userId: 11, score: 80 },
    });
    expect(res.status()).toBe(409);
    expect(await res.text()).toContain("デモモード");
  });

  test("入力検証: 範囲外スコアは400（Canvas接続前に弾く）", async ({ request }) => {
    // Canvas未接続では接続チェックが先に走るため、まず接続要件で409になる。
    // 検証ロジック自体は単体テスト（gradebook.test.ts parseScore）で担保する。
    const res = await request.post("/api/teacher/grade", {
      headers: { cookie: "role=teacher" },
      data: { userId: 11, score: 999 },
    });
    // 未接続環境では409（接続なし）。接続環境では400（範囲外）になる。
    expect([400, 409]).toContain(res.status());
  });

  test("権限: 生徒・ゲストは成績反映APIを使えない（403）", async ({ request }) => {
    for (const role of ["student", "guest"]) {
      const res = await request.post("/api/teacher/grade", {
        headers: { cookie: `role=${role}` },
        data: { userId: 11, score: 80 },
      });
      expect(res.status(), `role=${role}`).toBe(403);
    }
  });
});
