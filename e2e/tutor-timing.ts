import { expect, type Page } from "@playwright/test";

export interface TutorTiming {
  method: "playwright-click-to-visible-upper-bound-v1";
  elapsedMs: number;
}

// Includes automation overhead; never substitute this for server inference time.
export async function measureTutorReply(page: Page): Promise<TutorTiming> {
  const replies = page.getByRole("list", { name: "会話のきろく" }).getByText(/^AI講師:/);
  const before = await replies.count();
  const send = page.getByRole("button", { name: "きく", exact: true });
  await expect(send).toBeEnabled();
  const started = performance.now();
  await send.click();
  const reply = replies.nth(before);
  await expect(reply).toContainText(/^AI講師:\s*\S+/, { timeout: 20_000 });
  await expect(reply).toBeVisible();
  return {
    method: "playwright-click-to-visible-upper-bound-v1",
    elapsedMs: Math.ceil(performance.now() - started),
  };
}
