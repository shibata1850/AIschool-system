import { expect, test } from "@playwright/test";
import { setRole } from "../helpers";

// Checks browser -> API -> provider prompt transport; real answers require production verification.
for (const question of [
  "VercelとAWSの違いを教えて",
  "STEP03では何をしますか",
  "顧客の氏名と電話番号を1つのテーブルにまとめて持つ設計で大丈夫ですか",
]) {
  test(`concise tutor policy reaches provider: ${question}`, async ({ page, request }) => {
    await setRole(page, "student");
    await page.goto("/chat");
    await page.getByLabel("質問（しつもん）").fill(question);
    await page.getByRole("button", { name: "きく", exact: true }).click();
    const answer = page.getByText("AI講師:");
    await expect(answer).toContainText("講師に確認してください");
    await expect(answer).toHaveCSS("white-space", "pre-wrap");
    const response = await request.get(`${process.env.ANTHROPIC_BASE_URL}/tutor-request`);
    expect(response.ok()).toBe(true);
    const sent = await response.json();
    expect(sent.messages[0].content).toBe(question);
    expect(sent.system).toContain("回答全体で200文字程度");
    expect(sent.system).toContain("第1段落は結論を1文");
    expect(sent.system).toContain("必要な注意事項を削らず");
    expect(sent.system).toContain("毎回質問で締めくくらない");
    expect(sent.system).toContain("聞かれたら想像で答えず、講師に確認");
    expect(sent.system).toContain("最終確認は人に相談するよう必ず伝える");
    expect(sent.system).toContain("「大丈夫です」と答えない");
  });
}
