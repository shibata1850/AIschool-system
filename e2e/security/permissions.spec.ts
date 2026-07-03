import { expect, test } from "@playwright/test";

/**
 * SEC-1 権限総当たり（docs/テスト計画書.md 3章 セキュリティ横断）。
 * 全ロール×全画面のURL直接アクセスが権限マトリクス（要件定義書5.1）どおりで
 * あることを検証する。許可=200、非許可=403。
 * 受け入れ時はこのマトリクスを結果表として添付する。
 */

type Role = "student" | "teacher" | "admin" | "guest";

const PAGES: Array<{ path: string; name: string; allowed: Record<Role, boolean> }> = [
  {
    path: "/",
    name: "S1 受講生ホーム",
    allowed: { student: true, teacher: true, admin: true, guest: true },
  },
  {
    path: "/exercises/a1",
    name: "S2 プロンプト演習",
    allowed: { student: true, teacher: true, admin: true, guest: false },
  },
  {
    path: "/chat",
    name: "S3 AI講師チャット",
    allowed: { student: true, teacher: true, admin: true, guest: false },
  },
  {
    path: "/achievement",
    name: "S5 自分の到達度",
    allowed: { student: true, teacher: true, admin: true, guest: false },
  },
  {
    path: "/teacher/review",
    name: "S7 採点・差戻し",
    allowed: { student: false, teacher: true, admin: true, guest: false },
  },
  {
    path: "/teacher/monitor",
    name: "S6 授業中モニタリング",
    allowed: { student: false, teacher: true, admin: true, guest: false },
  },
  {
    path: "/teacher/report",
    name: "S8 週次到達度レポート",
    allowed: { student: false, teacher: true, admin: true, guest: false },
  },
  {
    path: "/admin/audit",
    name: "S10 監査ログ閲覧",
    allowed: { student: false, teacher: false, admin: true, guest: false },
  },
];

const ROLES: Role[] = ["student", "teacher", "admin", "guest"];

for (const role of ROLES) {
  for (const pageDef of PAGES) {
    const expected = pageDef.allowed[role] ? 200 : 403;
    test(`SEC-1: ${role} が ${pageDef.name}（${pageDef.path}）→ ${expected}`, async ({
      page,
    }) => {
      await page.context().addCookies([
        { name: "role", value: role, domain: "localhost", path: "/" },
      ]);
      const response = await page.goto(pageDef.path);
      expect(response?.status()).toBe(expected);
    });
  }
}
