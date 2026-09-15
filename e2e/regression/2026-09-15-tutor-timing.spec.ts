import { expect, test } from "@playwright/test";
import { setRole } from "../helpers";
import { measureTutorReply } from "../tutor-timing";

test("visible timing waits for each new answer, including delayed response", async ({ page }, testInfo) => {
  const diagnostics: string[] = [];
  page.on("console", (message) => {
    if (message.text().startsWith("[F2_UI]")) diagnostics.push(message.text());
  });
  await setRole(page, "student");
  await page.goto("/chat");
  let calls = 0;
  await page.route("**/api/chat", async (route) => {
    calls += 1;
    // Controlled fixture delay proves an old answer cannot finish the next sample.
    if (calls === 2) await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.fulfill({
      json: { maskedQuestion: "計測用の架空質問", reply: "計測用の架空回答", piiDetected: false, blocked: false },
    });
  });
  await page.getByLabel("質問（しつもん）").fill("最初の架空質問");
  const first = await measureTutorReply(page);
  await page.getByLabel("質問（しつもん）").fill("次の架空質問");
  const second = await measureTutorReply(page);
  expect(calls).toBe(2);
  expect(second.elapsedMs).toBeGreaterThanOrEqual(1000);
  expect(await page.getByText("AI講師:").count()).toBe(2);
  const replies = page.getByText("AI講師:");
  await expect(replies.nth(1)).toHaveAttribute("data-f2-render-ms", /^\d+$/);
  const browserElapsed = Number(await replies.nth(1).getAttribute("data-f2-render-ms"));
  expect(browserElapsed).toBeGreaterThanOrEqual(1000);
  expect(browserElapsed).toBeLessThanOrEqual(second.elapsedMs + 1000);
  await expect(replies.nth(1)).toHaveAttribute("data-f2-document-visible", "true");
  expect(diagnostics).toHaveLength(2);
  for (const diagnostic of diagnostics) {
    expect(diagnostic).toMatch(/^\[F2_UI\] method=reply-render-ready-v1 elapsedMs=\d+ documentVisible=(true|false) inViewport=(true|false)$/);
  }
  const firstValue = await replies.nth(0).getAttribute("data-f2-render-ms");
  await page.getByLabel("質問（しつもん）").fill("未送信の架空質問");
  await expect(replies.nth(0)).toHaveAttribute("data-f2-render-ms", firstValue!);
  expect(diagnostics).toHaveLength(2);
  await testInfo.attach("controlled-timing", {
    body: JSON.stringify({ environment: "intercepted-local-api", samples: [first, second], browserElapsed, acceptance: "not-evaluated" }),
    contentType: "application/json",
  });
});

test("failed response is not recorded as a successful render timing", async ({ page }) => {
  const diagnostics: string[] = [];
  page.on("console", (message) => {
    if (message.text().startsWith("[F2_UI]")) diagnostics.push(message.text());
  });
  await setRole(page, "student");
  await page.goto("/chat");
  await page.route("**/api/chat", route => route.fulfill({ status: 500, json: { error: "架空の失敗" } }));
  await page.getByLabel("質問（しつもん）").fill("失敗計測用の架空質問");
  await page.getByRole("button", { name: "きく", exact: true }).click();
  await expect(page.getByRole("region", { name: "チャット", exact: true }).getByRole("alert")).toBeVisible();
  await expect(page.locator("[data-f2-render-ms]")).toHaveCount(0);
  expect(diagnostics).toHaveLength(0);
});
