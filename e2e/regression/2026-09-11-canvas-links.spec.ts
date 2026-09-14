import { test, expect } from "@playwright/test";
import { SignJWT } from "jose";
import pg from "pg";

const dbUrl = new URL(process.env.DATABASE_ADMIN_URL ?? "");
const canvasUrl = new URL(process.env.CANVAS_BASE_URL ?? "");
if (process.env.LOCAL_COURSE_ISOLATION !== "1" || dbUrl.hostname !== "127.0.0.1" ||
    dbUrl.pathname !== "/aischool_test" || canvasUrl.hostname !== "127.0.0.1" || !process.env.LTI_SESSION_SECRET) {
  throw new Error("Isolated DB, Canvas fixture and generated session secret required");
}
const origin = `http://localhost:${process.env.LOCAL_E2E_PORT}`;
async function query(sql: string, values: unknown[] = []) {
  const db = new pg.Client({ connectionString: dbUrl.toString() });
  await db.connect();
  try { return await db.query(sql, values); } finally { await db.end(); }
}
test.beforeEach(async ({ page }) => {
  const token = await new SignJWT({ role: "teacher", courseId: "fictional-course-a" })
    .setProtectedHeader({ alg: "HS256" }).setSubject("fictional-teacher")
    .setIssuedAt().setExpirationTime("10m").sign(new TextEncoder().encode(process.env.LTI_SESSION_SECRET));
  await page.context().addCookies([{ name: "lti_session", value: token, domain: "localhost", path: "/" }]);
  expect((await page.request.post("/api/dev/reset")).ok()).toBe(true);
  expect((await page.request.post(new URL("/canvas-fixture/reset", canvasUrl).toString())).ok()).toBe(true);
});

test("registers through the allocation screen and uses that target for a completed grade", async ({ page }) => {
  await page.goto("/teacher/assignments");
  await page.getByRole("link", { name: "Canvas課題の対応" }).click();
  await page.getByRole("combobox", { name: "演習", exact: true }).selectOption("a1");
  await page.getByRole("combobox", { name: "Canvas課題（100点満点）", exact: true }).selectOption("901");
  await page.getByRole("button", { name: "対応を登録", exact: true }).click();
  await expect(page.getByText("Fictional Canvas 901（登録済み）", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "対応を登録", exact: true })).toHaveCount(0);
  await query(`INSERT INTO submissions (id,course_id,assignment_id,student_id,canvas_user_id,status,version,
    prompt_text,ai_output_text,reflection_text,is_late,has_deviation,versions)
    VALUES ('fictional-linked-sub','fictional-course-a','a1','fictional-learner',501,'submitted',1,'Fictional','Fictional','Fictional',false,false,'[]')`);
  const response = await page.request.post("/api/submissions/fictional-linked-sub/review", {
    data: { action: "complete", score: 90, canvasAssignmentId: 900, courseId: "fictional-course-b" },
  });
  expect(response.status()).toBe(200);
  expect((await response.json()).canvasSync.state).toBe("synced");
  const state = await page.request.get(new URL("/canvas-fixture/state", canvasUrl).toString());
  expect((await state.json()).grades).toEqual([{ courseId: 7, assignmentId: 901, userId: 501, score: 90 }]);
});

test("rejects cross-course, unpublished, wrong-scale and malformed targets without saving", async ({ page }) => {
  for (const [target, status] of [[999, 409], [902, 409], [903, 409], [0, 400]] as const) {
    const response = await page.request.post("/api/teacher/assignment-links", {
      headers: { origin }, data: { assignmentId: "a1", canvasAssignmentId: target },
    });
    expect(response.status()).toBe(status);
  }
  expect((await query("SELECT count(*)::int AS n FROM canvas_assignment_links")).rows[0].n).toBe(0);
});

test("rejects a foreign origin and does not overwrite an existing mapping", async ({ page }) => {
  const data = { assignmentId: "a1", canvasAssignmentId: 900 };
  expect((await page.request.post("/api/teacher/assignment-links", { headers: { origin: "https://other.example" }, data })).status()).toBe(403);
  expect((await page.request.post("/api/teacher/assignment-links", { headers: { origin }, data })).status()).toBe(200);
  expect((await page.request.post("/api/teacher/assignment-links", { headers: { origin }, data: { ...data, canvasAssignmentId: 901 } })).status()).toBe(409);
  expect((await query("SELECT canvas_assignment_id FROM canvas_assignment_links")).rows).toEqual([{ canvas_assignment_id: 900 }]);
});

test("registration form fits a narrow viewport without an accidental registration", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/teacher/assignment-links");
  await expect(page.getByRole("combobox", { name: "演習", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "対応を登録", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/canvas-link-mobile.png", fullPage: true });
});

test("Canvas class roster shows only the launched course", async ({ page }) => {
  await page.goto("/teacher/class");
  await expect(page.getByText("Fictional Canvas learner A", { exact: true })).toBeVisible();
  await expect(page.getByText("Fictional Canvas learner B", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Fictional Canvas 900", { exact: true })).toBeVisible();
  await expect(page.getByText("Fictional Canvas 999", { exact: true })).toHaveCount(0);
});

test("Canvas summary defaults to launch course while offering other courses", async ({ page }) => {
  await page.goto("/teacher/summary");
  await expect(page.getByText("Fictional Canvas learner A", { exact: true })).toBeVisible();
  await expect(page.getByText("Fictional Canvas learner B", { exact: true })).toHaveCount(0);
  const selector = page.getByRole("combobox", { name: "コース", exact: true });
  await expect(selector).toHaveValue("7");
  await expect(selector.getByRole("option", { name: "fictional-course-b", exact: true })).toHaveCount(1);
  await expect(page.locator("main strong").filter({ hasText: /^fictional-course-a$/ })).toBeVisible();
  await expect(page.locator("main strong").filter({ hasText: /^fictional-course-b$/ })).toHaveCount(0);
});
