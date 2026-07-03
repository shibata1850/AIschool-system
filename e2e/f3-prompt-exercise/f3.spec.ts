import { expect, test, type Page } from "@playwright/test";
import { resetStore, setRole } from "../helpers";

/**
 * F3 プロンプト演習のE2E（docs/テスト計画書.md 3章 F3）。
 * 4パス: 正常系 / 入力エラー系 / 権限系 / 境界値
 */


async function submitAsStudent(page: Page, text: string) {
  await setRole(page, "student");
  await page.goto("/exercises/a1");
  await page.getByLabel("プロンプト本文").fill(text);
  await page.getByRole("button", { name: "提出する" }).click();
  await expect(page.getByLabel("状態")).toContainText("AI採点済");
}

test.beforeEach(async ({ request }) => {
  await resetStore(request);
});

test("F3-N1 正常系: 提出→AI採点→講師確認→完了（点数が受講生に見える）", async ({
  page,
}) => {
  await submitAsStudent(
    page,
    "あなたはパン屋の店長です。小学生向けに、100文字くらいで、わくわくする雰囲気でメロンパンを紹介してください。",
  );
  await expect(page.getByLabel("AIからの講評")).toBeVisible();

  // 講師が確認して完了にする
  await setRole(page, "teacher");
  await page.goto("/teacher/review");
  await expect(page.getByText("お店の紹介文をAIに書かせよう")).toBeVisible();
  await page.getByRole("button", { name: "完了にする" }).click();
  await expect(page.getByText("採点待ちの提出はありません")).toBeVisible();

  // 受講生に完了と点数が見える（成績反映）
  await setRole(page, "student");
  await page.goto("/exercises/a1");
  await expect(page.getByLabel("状態")).toContainText("完了");
  await expect(page.getByLabel("点数")).toContainText("点");
});

test("F3-N2 正常系: 差戻し→修正→再提出で第2版になる", async ({ page }) => {
  await submitAsStudent(page, "メロンパンの紹介文を書いて。");

  await setRole(page, "teacher");
  await page.goto("/teacher/review");
  await page
    .getByLabel("コメント（差戻しのときは必須・1,000文字まで）")
    .fill("「だれに向けて」を指定してみよう");
  await page.getByRole("button", { name: "差戻す" }).click();
  await expect(page.getByText("採点待ちの提出はありません")).toBeVisible();

  await setRole(page, "student");
  await page.goto("/exercises/a1");
  await expect(page.getByLabel("先生からのコメント")).toContainText(
    "「だれに向けて」を指定してみよう",
  );
  await page
    .getByLabel("プロンプト本文")
    .fill("小学生に向けて、メロンパンの紹介文を書いて。");
  await page.getByRole("button", { name: "提出する" }).click();
  await expect(page.getByLabel("状態")).toContainText("AI採点済");
  await expect(page.getByLabel("状態")).toContainText("第2版");
});

test("F3-E1 入力エラー: コメントなしの差戻しは拒否される", async ({ page }) => {
  await submitAsStudent(page, "メロンパンの紹介文を書いて。");

  await setRole(page, "teacher");
  await page.goto("/teacher/review");
  await page.getByRole("button", { name: "差戻す" }).click();
  await expect(page.getByText("差戻しにはコメントが必要です")).toBeVisible();
});

test("F3-P1 権限系: 受講生が採点画面のURLを直接開くと403", async ({ page }) => {
  await setRole(page, "student");
  const response = await page.goto("/teacher/review");
  expect(response?.status()).toBe(403);
});

test("F3-P2 権限系: 受講生が採点APIを直接叩くと403", async ({ page, request }) => {
  await submitAsStudent(page, "メロンパンの紹介文を書いて。");
  const res = await request.post("/api/submissions/s1/review", {
    data: { action: "complete" },
    headers: { cookie: "role=student" },
  });
  expect(res.status()).toBe(403);
});

test("F3-B1 境界値: 文字数上限ちょうどは提出可、+1文字は提出不可", async ({
  page,
}) => {
  await setRole(page, "student");
  await page.goto("/exercises/a1");

  // 上限+1文字: エラー表示＋提出ボタン無効
  await page.getByLabel("プロンプト本文").fill("あ".repeat(4001));
  await expect(page.getByText("文字数が上限（4000文字）を超えています")).toBeVisible();
  await expect(page.getByRole("button", { name: "提出する" })).toBeDisabled();

  // 上限ちょうど: 提出できる
  await page.getByLabel("プロンプト本文").fill("あ".repeat(4000));
  await expect(page.getByText("のこり 0 文字")).toBeVisible();
  await page.getByRole("button", { name: "提出する" }).click();
  await expect(page.getByLabel("状態")).toContainText("AI採点済");
});
