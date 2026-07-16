import { expect, test } from "@playwright/test";
import { resetStore } from "../helpers";

/**
 * 監査ログCSVエクスポート（S10）。管理者のみ・出力操作も監査記録。
 */
test.beforeEach(async ({ request }) => {
  await resetStore(request);
});

test("管理者はCSVをダウンロードできる（CSVヘッダーが返る）", async ({ request }) => {
  const res = await request.get("/admin/audit/export", {
    headers: { cookie: "role=admin" },
  });
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  const body = await res.text();
  expect(body).toContain("日時,操作者ロール");
});

test("権限: 講師・受講生・ゲストはCSVエクスポートを取得できない（403）", async ({
  request,
}) => {
  for (const role of ["teacher", "student", "guest"]) {
    const res = await request.get("/admin/audit/export", {
      headers: { cookie: `role=${role}` },
    });
    expect(res.status(), `role=${role}`).toBe(403);
  }
});
