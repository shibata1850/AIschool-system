import { expect, test } from "@playwright/test";
import { resetStore, setRole } from "../helpers";

/**
 * F3① 講師の確定スコア → Canvas成績表 の書き戻し（REST方式・2026-08-28決定）のE2E。
 * docs/テスト計画書.md 3章 F3-N1 に対応。
 * 4パス: 正常系 / 入力エラー系 / 権限系 / 境界値
 *
 * E2EはCanvas未接続で動く（playwright.config.ts が CANVAS_BASE_URL を空にする）。
 * そのため「Canvasへ実際に載ること」ではなく、**採点が成立したうえで反映状況が
 * 正しく講師に伝わること**を検証する。実Canvasでの反映確認は手動対応リスト B15。
 */

async function submitAsStudent(page: import("@playwright/test").Page) {
  await setRole(page, "student");
  await page.goto("/exercises/a1");
  await page.getByLabel("プロンプト本文").fill("メロンパンの紹介文を書いて。");
  await page.getByRole("button", { name: "提出する" }).click();
  await expect(page.getByLabel("状態")).toContainText("AI採点済");
}

test.beforeEach(async ({ request }) => {
  await resetStore(request);
});

test("F3-N1 正常系: 完了時にCanvas未反映なら理由が講師に示される", async ({ page }) => {
  await submitAsStudent(page);

  await setRole(page, "teacher");
  await page.goto("/teacher/review");
  await page.getByLabel(/講師スコア/).fill("90");
  await page.getByRole("button", { name: "完了にする" }).click();

  // 採点は確定して一覧から消え、Canvasへ載っていないことが同じ画面で明示される
  await expect(page.getByText("採点待ちの提出はありません")).toBeVisible();
  const failures = page.getByLabel("Canvas未反映の提出");
  await expect(failures).toBeVisible();
  await expect(failures).toContainText("Canvas未接続");
});

test("F3-N1 正常系: 未反映の提出はS7に一覧として残る（見落とし防止）", async ({ page }) => {
  await submitAsStudent(page);

  await setRole(page, "teacher");
  await page.goto("/teacher/review");
  await page.getByLabel(/講師スコア/).fill("90");
  await page.getByRole("button", { name: "完了にする" }).click();
  await expect(page.getByLabel("Canvas未反映の提出")).toBeVisible();

  // 画面を開き直しても未反映の記録が残っている（見落とし防止）
  await page.goto("/teacher/review");
  const failures = page.getByLabel("Canvas未反映の提出");
  await expect(failures).toBeVisible();
  await expect(failures).toContainText("Canvas未接続");
});

test("F3-N1 正常系: 採点確定そのものは成立する（Canvas不通でも失われない）", async ({
  page,
}) => {
  await submitAsStudent(page);

  await setRole(page, "teacher");
  await page.goto("/teacher/review");
  await page.getByLabel(/講師スコア/).fill("90");
  await page.getByRole("button", { name: "完了にする" }).click();
  await expect(page.getByText("採点待ちの提出はありません")).toBeVisible();

  // 到達度（F3→F4連携）には反映されている: 90*0.6+100*0.2+100*0.2 = 94
  await setRole(page, "student");
  await page.goto("/achievement");
  await expect(page.getByLabel("2026-10-19の週")).toContainText("到達度 94");
});

test("F3-E1 入力エラー: 差戻しではCanvas反映を試みない", async ({ page }) => {
  await submitAsStudent(page);

  await setRole(page, "teacher");
  await page.goto("/teacher/review");
  await page.getByLabel(/コメント（差戻しのときは必須/).fill("「だれに向けて」を書いてみよう。");
  await page.getByRole("button", { name: "差戻す" }).click();

  // 差戻しは成績確定ではないため、Canvas未反映の記録は作られない
  await page.goto("/teacher/review");
  await expect(page.getByLabel("Canvas未反映の提出")).toBeHidden();
});

test("F3-P1 権限系: 受講生は採点APIを叩けない（Canvas書き戻しも起きない）", async ({
  page,
  request,
}) => {
  await submitAsStudent(page);
  const res = await request.post("/api/submissions/s1/review", {
    data: { action: "complete", score: 90 },
    headers: { cookie: "role=student" },
  });
  expect(res.status()).toBe(403);
});

test("F3-B1 境界値: 0点・100点でも確定でき、反映状況が返る", async ({ page, request }) => {
  for (const score of [0, 100]) {
    await resetStore(request);
    await submitAsStudent(page);

    const res = await request.post("/api/submissions/s1/review", {
      data: { action: "complete", score },
      headers: { cookie: "role=teacher" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("completed");
    // Canvas未接続なのでスキップ扱いになる（状態が返ること自体を確認する）
    expect(body.canvasSync.state).toBe("skipped");
  }
});
