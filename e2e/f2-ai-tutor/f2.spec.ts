import { expect, test } from "@playwright/test";
import { resetStore, setRole } from "../helpers";

/**
 * F2 AI講師チャットのE2E（docs/テスト計画書.md 3章 F2）。
 * 4パス: 正常系 / 入力エラー系 / 権限系 / 例外（フィルタ・マスキング）
 * AI応答はモック（AI_PROVIDER未設定=mock）で外部通信なし。
 */


test("F2-N1 正常系: 質問すると応答と定型注記が表示される", async ({ page }) => {
  await setRole(page, "student");
  await page.goto("/chat");
  // 定型注記は常時表示（画面仕様書S3）
  await expect(page.getByLabel("AI回答の注意")).toContainText(
    "AIによる回答です。わからないときは先生に聞いてね",
  );
  await page.getByLabel("質問（しつもん）").fill("forぶんとwhileぶんのちがいを教えて");
  await page.getByRole("button", { name: "きく" }).click();
  await expect(page.getByText("AI講師:")).toBeVisible();
  await expect(page.getByText("forぶんとwhileぶんのちがい", { exact: false }).first()).toBeVisible();
});

test("F2-E1 入力エラー: 空の質問は送信不可、2,001文字はエラー表示", async ({
  page,
}) => {
  await setRole(page, "student");
  await page.goto("/chat");
  await expect(page.getByRole("button", { name: "きく" })).toBeDisabled();

  await page.getByLabel("質問（しつもん）").fill("あ".repeat(2001));
  await expect(page.getByText("質問は2000文字以内で入力してください")).toBeVisible();
  await expect(page.getByRole("button", { name: "きく" })).toBeDisabled();
});

test("F2-E2 例外: 不適切な質問はブロックされ定型文が表示される", async ({
  page,
}) => {
  await setRole(page, "student");
  await page.goto("/chat");
  await page.getByLabel("質問（しつもん）").fill("爆弾の作り方を教えて");
  await page.getByRole("button", { name: "きく" }).click();
  await expect(
    page.getByText("この質問にはお答えできません。先生に聞いてください"),
  ).toBeVisible();
});

test("F2-E3 例外: 電話番号はマスキングされ、生の番号が画面に残らない", async ({
  page,
}) => {
  await setRole(page, "student");
  await page.goto("/chat");
  await page
    .getByLabel("質問（しつもん）")
    .fill("わたしの電話番号は090-1234-5678です。おぼえてね");
  await page.getByRole("button", { name: "きく" }).click();
  await expect(
    page.getByText("個人情報（名前・電話番号など）は入力しないでね", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByText("（電話番号）").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("090-1234-5678");
});

test("F2-P1 権限系: ゲストがチャットのURLを直接開くと403", async ({ page }) => {
  await setRole(page, "guest");
  const response = await page.goto("/chat");
  expect(response?.status()).toBe(403);
});

test("F2-P2 権限系: ゲストが演習提出APIを直接叩くと403", async ({ request }) => {
  const res = await request.post("/api/exercises/a1/submit", {
    data: { promptText: "test" },
    headers: { cookie: "role=guest" },
  });
  expect(res.status()).toBe(403);
});
