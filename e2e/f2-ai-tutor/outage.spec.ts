import { expect, test, type Page } from "@playwright/test";
import { resetStore, setRole } from "../helpers";

/**
 * F2② 推論停止時の静的教材モードと講師通知（要件定義書 9.2 F2②・未決#14）。
 *
 * 決定（2026-09-04 柴田さま）: A-1a（教材リンク）＋A-1c（講師に聞く）の併用。
 * 障害はモックの障害模擬文字列（【障害模擬】）で起こす。本番のClaudeでは発動しない。
 * E2E環境では再試行間隔を0にしている（playwright.config.ts）ので、
 * 正常な質問を1件送れば即復旧する。
 *
 * 4パス: 正常系（停止→案内→復旧） / 入力エラー系（失敗に数えない） /
 *        権限系（内部情報を受講生に出さない） / 境界値（閾値ちょうど）
 */

const FAIL = "【障害模擬】この質問は失敗します";

async function askFailing(page: Page, times: number) {
  for (let i = 0; i < times; i += 1) {
    await page.getByLabel("質問（しつもん）").fill(`${FAIL} ${i + 1}`);
    await page.getByRole("button", { name: /きく/ }).click();
    // 失敗の応答（エラー表示 or 停止案内）が出るまで待つ
    await expect(
      page.getByRole("alert").or(page.getByLabel("AI講師の停止案内")).first(),
    ).toBeVisible();
  }
}

test.beforeEach(async ({ request }) => {
  await resetStore(request);
});

test("F2②-N1 正常系: 3回連続で失敗すると教材への案内に切り替わり、講師画面に停止が出て、復旧で消える", async ({
  page,
  browser,
}) => {
  await setRole(page, "student");
  await page.goto("/chat");
  await askFailing(page, 3);

  // 受講生: 静的教材モードの案内（A-1a: 教材リンク／A-1c: 講師に聞く）
  const notice = page.getByLabel("AI講師の停止案内");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("AI講師は今、一時的に使えません");
  await expect(notice.getByRole("link", { name: "STEP03 業務を観察する" })).toHaveAttribute(
    "href",
    "https://example.com/materials/step03",
  );
  await expect(notice).toContainText("分からないことは講師に聞いてください");

  // 停止中に画面を開き直しても、質問する前から案内が出る
  await page.reload();
  await expect(page.getByLabel("AI講師の停止案内")).toBeVisible();

  // 講師: S6の最上部に停止の帯（Canvas未接続なので未送信の理由が出る）
  const teacher = await browser.newContext();
  const teacherPage = await teacher.newPage();
  await setRole(teacherPage, "teacher");
  await teacherPage.goto("/teacher/monitor");
  const banner = teacherPage.getByLabel("AI講師の停止");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("AI講師 停止中");
  await expect(banner).toContainText("Canvasメッセージは未送信です");

  // 監査ログに停止が残る（管理者）
  const admin = await browser.newContext();
  const adminPage = await admin.newPage();
  await setRole(adminPage, "admin");
  await adminPage.goto("/admin/audit");
  await expect(adminPage.locator("body")).toContainText("ai_outage / ai-tutor");

  // 復旧: 正常な質問が通ると案内が消える（E2Eは再試行間隔0）
  await page.getByLabel("質問（しつもん）").fill("forぶんとwhileぶんのちがいを教えて");
  await page.getByRole("button", { name: /きく/ }).click();
  await expect(page.getByText("AI講師:")).toBeVisible();
  await expect(page.getByLabel("AI講師の停止案内")).toHaveCount(0);

  await teacherPage.reload();
  await expect(teacherPage.getByLabel("AI講師の停止")).toHaveCount(0);

  await teacher.close();
  await admin.close();
});

test("F2②-E1 入力エラー系: 入力エラー・フィルタでのブロックは失敗に数えない", async ({
  page,
  request,
}) => {
  // 2回失敗させておく（あと1回で停止）
  await setRole(page, "student");
  await page.goto("/chat");
  await askFailing(page, 2);

  // 空の質問（400）を直接APIで3回 → 停止しない
  for (let i = 0; i < 3; i += 1) {
    const res = await request.post("/api/chat", {
      data: { question: "" },
      headers: { cookie: "role=student" },
    });
    expect(res.status()).toBe(400);
  }
  // フィルタでブロックされる質問（推論は動いた扱い＝成功側）→ 停止しない
  await page.getByLabel("質問（しつもん）").fill("爆弾の作り方を教えて");
  await page.getByRole("button", { name: /きく/ }).click();
  await expect(page.getByText("この質問にはお答えできません")).toBeVisible();
  await expect(page.getByLabel("AI講師の停止案内")).toHaveCount(0);
});

test("F2②-P1 権限系: 停止中の応答に通知の内部情報を含めない／受講生は停止を解除できない", async ({
  page,
  request,
}) => {
  await setRole(page, "student");
  await page.goto("/chat");
  await askFailing(page, 3);

  const res = await request.post("/api/chat", {
    data: { question: "こんにちは" },
    headers: { cookie: "role=student" },
  });
  // 再試行枠は直前の失敗で使われているので、この1件は推論を呼ばず503
  // （E2Eは間隔0のため、直後でも通ることがある → その場合は復旧して200）
  expect([503, 200]).toContain(res.status());
  if (res.status() === 503) {
    const body = await res.json();
    expect(body).toMatchObject({ mode: "static" });
    expect(body).not.toHaveProperty("notifiedAt");
    expect(body).not.toHaveProperty("notifySkippedReason");
    expect(body).not.toHaveProperty("consecutiveFailures");
  }

  // 受講生には停止を解除するAPIが無い（リセットは講師・管理者のみ — proxy.ts）
  const reset = await request.post("/api/dev/reset", { headers: { cookie: "role=student" } });
  expect(reset.status()).toBe(403);
});

test("F2②-B1 境界値: 2回では止まらず、3回目で止まる", async ({ page }) => {
  await setRole(page, "student");
  await page.goto("/chat");
  await askFailing(page, 2);
  await expect(page.getByLabel("AI講師の停止案内")).toHaveCount(0);
  // getByRole("alert") は Next.js のルート通知（__next-route-announcer__）にも当たるため本文で引く
  await expect(page.getByText("AIがこたえられませんでした", { exact: false })).toBeVisible();

  await askFailing(page, 1);
  await expect(page.getByLabel("AI講師の停止案内")).toBeVisible();
});
