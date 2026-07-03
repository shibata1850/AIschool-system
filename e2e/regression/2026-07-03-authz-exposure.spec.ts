import { expect, test } from "@playwright/test";
import { setRole } from "../helpers";

/**
 * 回帰テスト（2026-07-03 コード監査の指摘#6・#9・#10）:
 * - ゲストに受講生の学習状況を表示しない
 * - 破壊的な開発用リセットAPIは講師・管理者のみ
 * - 不正なJSONボディは500ではなく400
 */

test("指摘#6: ゲストのホームに受講生の課題・進捗が表示されない", async ({ page }) => {
  await setRole(page, "guest");
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Next Gen AI School へようこそ" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("お店の紹介文をAIに書かせよう");
  await expect(page.locator("body")).not.toContainText("きょうやること");
});

test("指摘#10: 開発用リセットAPIは受講生・ゲストには403", async ({ request }) => {
  for (const role of ["student", "guest"]) {
    const res = await request.post("/api/dev/reset", {
      headers: { cookie: `role=${role}` },
    });
    expect(res.status()).toBe(403);
  }
  const teacherRes = await request.post("/api/dev/reset", {
    headers: { cookie: "role=teacher" },
  });
  expect(teacherRes.status()).toBe(200);
});

test("指摘#9: チャットAPIへの不正なJSONは400（500にしない）", async ({ request }) => {
  const res = await request.post("/api/chat", {
    headers: { cookie: "role=student", "content-type": "application/json" },
    data: "{壊れたJSON",
  });
  expect(res.status()).toBe(400);
});

test("指摘#9: 提出APIへの不正なJSONは400（500にしない）", async ({ request }) => {
  const res = await request.post("/api/exercises/a1/submit", {
    headers: { cookie: "role=student", "content-type": "application/json" },
    data: "{壊れたJSON",
  });
  expect(res.status()).toBe(400);
});
