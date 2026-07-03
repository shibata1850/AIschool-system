import type { APIRequestContext, Page } from "@playwright/test";

export type Role = "student" | "teacher" | "admin" | "guest";

/** ロールCookieを設定する（本番はLTI 1.3ロール。全スペック共通のテスト用ヘルパー） */
export async function setRole(page: Page, role: Role): Promise<void> {
  await page.context().addCookies([
    { name: "role", value: role, domain: "localhost", path: "/" },
  ]);
}

/** ストアを初期状態へ戻す（リセットAPIは講師・管理者のみ — proxy.ts） */
export async function resetStore(request: APIRequestContext): Promise<void> {
  const res = await request.post("/api/dev/reset", {
    headers: { cookie: "role=teacher" },
  });
  if (!res.ok()) {
    throw new Error(`ストア初期化に失敗しました: ${res.status()}`);
  }
}
