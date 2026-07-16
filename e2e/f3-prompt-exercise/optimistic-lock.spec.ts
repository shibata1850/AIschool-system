import { expect, test } from "@playwright/test";
import { resetStore, setRole } from "../helpers";

/**
 * 二重提出の楽観ロック（版数チェック。TASK E・既知残課題#1）。
 * 画面が読んだ版（expectedVersion）と現在の版が食い違う提出は409で拒否し、
 * 別端末/別タブによるロストアップデートを防ぐ。
 * 4パス: 正常系 / 入力エラー系 / 権限系（f3.specでカバー）/ 境界値（版数の食い違い）
 */
test.beforeEach(async ({ request }) => {
  await resetStore(request);
});

test("OL-N 正常系: 正しい版数（expectedVersion=1）の提出は成功する", async ({
  request,
}) => {
  const res = await request.post("/api/exercises/a1/submit", {
    headers: { cookie: "role=student" },
    data: { promptText: "メロンパンの紹介文を書いて。", expectedVersion: 1 },
  });
  expect(res.status()).toBe(200);
  expect((await res.json()).status).toBe("submitted");
});

test("OL-N2 後方互換: expectedVersion を省略しても提出できる", async ({ request }) => {
  const res = await request.post("/api/exercises/a1/submit", {
    headers: { cookie: "role=student" },
    data: { promptText: "メロンパンの紹介文を書いて。" },
  });
  expect(res.status()).toBe(200);
});

test("OL-E 入力エラー: expectedVersion が整数でないと400", async ({ request }) => {
  const res = await request.post("/api/exercises/a1/submit", {
    headers: { cookie: "role=student" },
    data: { promptText: "メロンパンの紹介文を書いて。", expectedVersion: "1" },
  });
  expect(res.status()).toBe(400);
});

test("OL-B 境界値: 古い版（expectedVersion=999）での提出は409で拒否", async ({
  request,
}) => {
  const res = await request.post("/api/exercises/a1/submit", {
    headers: { cookie: "role=student" },
    data: { promptText: "メロンパンの紹介文を書いて。", expectedVersion: 999 },
  });
  expect(res.status()).toBe(409);
});

test("OL-R ロストアップデート防止: 再提出で版が上がった後、古い版での提出は409", async ({
  page,
  request,
}) => {
  // 1. 提出 → AI採点済（第1版）
  await setRole(page, "student");
  await page.goto("/exercises/a1");
  await page.getByLabel("プロンプト本文").fill("メロンパンの紹介文を書いて。");
  await page.getByRole("button", { name: "提出する" }).click();
  await expect(page.getByLabel("状態")).toContainText("AI採点済");

  // 2. 講師が差戻し
  await setRole(page, "teacher");
  await page.goto("/teacher/review");
  await page
    .getByLabel("コメント（差戻しのときは必須・1,000文字まで）")
    .fill("だれに向けてを指定してみよう");
  await page.getByRole("button", { name: "差戻す" }).click();
  await expect(page.getByText("採点待ちの提出はありません")).toBeVisible();

  // 3. 端末Aが再提出 → 第2版へ上がる
  await setRole(page, "student");
  await page.goto("/exercises/a1");
  await page.getByLabel("プロンプト本文").fill("小学生に向けて紹介文を書いて。");
  await page.getByRole("button", { name: "提出する" }).click();
  await expect(page.getByLabel("状態")).toContainText("第2版");

  // 4. 端末B（まだ第1版と思っている）が再提出 → 版が食い違うため409
  const res = await request.post("/api/exercises/a1/submit", {
    headers: { cookie: "role=student" },
    data: { promptText: "別の内容", expectedVersion: 1 },
  });
  expect(res.status()).toBe(409);
});
