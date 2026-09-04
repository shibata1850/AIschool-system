import { expect, test } from "@playwright/test";
import { setRole } from "../helpers";

/**
 * トップページの導線（2026-09-04追加）。
 *
 * **なぜ要るか**: S9 デバイス割当は実装済みだったが**メニューにリンクが無く**、
 * URLを直打ちしないと開けない状態だった（2026-09-03の本番確認で判明）。
 * 講師はIT系の知識がない人でも務まるようにする方針（CLAUDE.md 4章・F6①）なので、
 * 「画面はあるが辿り着けない」は機能が無いのと同じ。
 *
 * **この形にした理由**: 画面を1つ足すたびにテストを書き足すのでは同じ穴が空く。
 * **講師・管理者しか入れない画面は全部、トップから1クリックで開けること**を
 * 総当たりで固定する（権限総当たり SEC-1 の画面一覧と対になる）。
 * 4パス: 正常系 / 入力エラー系（該当なし・下記） / 権限系 / 境界値
 */

/** 講師・管理者だけが入れる画面（SEC-1 の画面一覧と一致させる） */
const TEACHER_PAGES = [
  { path: "/teacher/monitor", name: "S6 授業中モニタリング" },
  { path: "/teacher/attendance", name: "出席の記録" },
  { path: "/teacher/devices", name: "S9 デバイス割当" },
  { path: "/teacher/review", name: "S7 採点・差戻し" },
  { path: "/teacher/report", name: "S8 週次到達度レポート" },
  { path: "/teacher/chat-logs", name: "S11 AI講師の会話ログ" },
  { path: "/teacher/class", name: "クラス名簿（Canvas）" },
  { path: "/teacher/grade", name: "成績入力（Canvas）" },
  { path: "/teacher/summary", name: "成績サマリ（Canvas）" },
];

/** 管理者だけが入れる画面 */
const ADMIN_PAGES = [
  { path: "/admin/audit", name: "S10 監査ログ閲覧" },
  { path: "/admin/canvas", name: "Canvas連携状況" },
];

test("NAV-N1 正常系: 講師の画面はすべてトップからリンクされている", async ({ page }) => {
  await setRole(page, "teacher");
  await page.goto("/");

  const menu = page.getByRole("region", { name: "講師用メニュー" });
  for (const { path, name } of TEACHER_PAGES) {
    await expect(menu.locator(`a[href="${path}"]`), `${name} の導線が無い`).toBeVisible();
  }
});

test("NAV-N2 正常系: 管理者の画面もリンクされている（講師の画面も見える）", async ({ page }) => {
  await setRole(page, "admin");
  await page.goto("/");

  for (const { path, name } of [...TEACHER_PAGES, ...ADMIN_PAGES]) {
    await expect(page.locator(`a[href="${path}"]`), `${name} の導線が無い`).toBeVisible();
  }
});

test("NAV-N3 正常系: デバイス割当はクリックで開ける（URL直打ちを要求しない）", async ({ page }) => {
  await setRole(page, "teacher");
  await page.goto("/");

  await page.getByRole("link", { name: /デバイス割当/ }).click();
  await expect(page.getByRole("heading", { name: "デバイス割当" })).toBeVisible();
});

test("NAV-P1 権限系: 受講生・ゲストに講師/管理者の導線を出さない", async ({ page }) => {
  for (const role of ["student", "guest"] as const) {
    await setRole(page, role);
    await page.goto("/");
    await expect(page.getByRole("region", { name: "講師用メニュー" })).toHaveCount(0);
    for (const { path } of [...TEACHER_PAGES, ...ADMIN_PAGES]) {
      await expect(page.locator(`a[href="${path}"]`)).toHaveCount(0);
    }
  }
});

test("NAV-B1 境界値: 講師には管理者専用の導線を出さない", async ({ page }) => {
  await setRole(page, "teacher");
  await page.goto("/");
  await expect(page.getByRole("region", { name: "管理者メニュー" })).toHaveCount(0);
  for (const { path } of ADMIN_PAGES) {
    await expect(page.locator(`a[href="${path}"]`)).toHaveCount(0);
  }
});
