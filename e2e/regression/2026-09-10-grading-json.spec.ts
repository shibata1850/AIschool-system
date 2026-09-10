import { test, expect } from "@playwright/test";
import { resetStore, setRole } from "../helpers";

test.beforeEach(async ({ request, baseURL }) => {
  if (process.env.LOCAL_GRADING_E2E !== "1" || new URL(baseURL!).hostname !== "localhost") {
    throw new Error("Run with playwright.grading.config.ts and the isolated DB harness");
  }
  await request.post(process.env.ANTHROPIC_BASE_URL + "/reset-fixture");
  await resetStore(request);
});

for (const marker of ["FENCE", "PLAIN", "ZERO", "HUNDRED"]) {
  test(`AI grading ${marker}: submit, review and show final score`, async ({ page, request }) => {
    const score = marker === "ZERO" ? 0 : marker === "HUNDRED" ? 100 : 90;
    await setRole(page, "student");
    await page.goto("/exercises/a1");
    await page.getByLabel("プロンプト本文").fill(`E2E_${marker}: 架空の店舗を社会人向けに紹介してください。`);
    await page.getByRole("button", { name: "提出する", exact: true }).click();
    await expect(page.getByLabel("状態", { exact: true })).toContainText("AI採点済");
    await expect(page.getByLabel("AIからの講評", { exact: true })).toContainText("対象読者が明確です");
    const reviewed = await request.post("/api/submissions/s1/review", {
      headers: { cookie: "role=teacher" }, data: { action: "complete" },
    });
    expect(reviewed.status()).toBe(200);
    await page.reload();
    await expect(page.getByLabel("点数", { exact: true })).toContainText(`${score}点`);
  });
}

test("malformed response preserves submission for teacher review", async ({ page, request }) => {
  await setRole(page, "student");
  await page.goto("/exercises/a1");
  await page.getByLabel("プロンプト本文").fill("E2E_INVALID: 架空店舗の紹介文を書いてください。");
  await page.getByRole("button", { name: "提出する", exact: true }).click();
  await expect(page.getByLabel("状態", { exact: true })).toContainText("提出済");
  // Wait for the local fixture to receive the grading call, without a fixed sleep.
  await expect.poll(async () => {
    const res = await request.get(process.env.ANTHROPIC_BASE_URL + "/seen-invalid");
    return (await res.json()).seen;
  }).toBe(true);
  await setRole(page, "teacher");
  await page.goto("/teacher/review");
  await expect(page.getByText("E2E_INVALID:", { exact: false })).toBeVisible();
  const reviewed = await request.post("/api/submissions/s1/review", {
    headers: { cookie: "role=teacher" }, data: { action: "complete", score: 75 },
  });
  expect(reviewed.status()).toBe(200);
});

test("student cannot complete a grade", async ({ request }) => {
  const res = await request.post("/api/submissions/s1/review", {
    headers: { cookie: "role=student" }, data: { action: "complete", score: 100 },
  });
  expect(res.status()).toBe(403);
});
