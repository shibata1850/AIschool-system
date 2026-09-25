import { test, expect } from "@playwright/test";
import { signSession } from "../../src/lib/lti/session";
import pg from "pg";

test("approved BtoB links survive save and reload without leaking to other courses", async ({ page, context, baseURL }, info) => {
  const courseId = "f97330a96452fc363a34e0ef6d8d0d3e9e1007d2";
  const material = "https://ngas-step01-pc-review.vercel.app/btob/step02/";
  const quiz = "https://canvas.133-125-225-64.sslip.io/courses/2/quizzes/129";
  async function login(role: "teacher" | "student", course = courseId) {
    const value = await signSession({ sub: `fictional-links-${role}`, role, courseId: course }, process.env.LTI_SESSION_SECRET!);
    await context.addCookies([{ name: "lti_session", value, url: baseURL! }]);
  }
  await login("teacher");
  await page.goto("/teacher/training");
  await page.getByRole("radio", { name: "BtoB研修型" }).check();
  await page.getByLabel("第1回の授業名", { exact: true }).fill(`Link verification ${info.project.name}`);
  await page.getByLabel("現在の授業", { exact: true }).selectOption("1");
  await expect(page.locator("#training-material-1 option")).toHaveCount(10);
  await expect(page.locator("#training-quiz-1 option")).toHaveCount(10);
  await page.locator("#training-material-1").selectOption(material);
  await page.locator("#training-quiz-1").selectOption(quiz);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("保存しました");
  await page.reload();
  await expect(page.locator("#training-material-1")).toHaveValue(material);
  await expect(page.locator("#training-quiz-1")).toHaveValue(quiz);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("approved-links-settings.png"), fullPage: true, caret: "initial" });
  await login("student");
  await page.goto("/");
  await expect(page.getByRole("link", { name: "教材を開く", exact: true })).toHaveAttribute("href", material);
  await expect(page.getByRole("link", { name: "小テストを開く", exact: true })).toHaveAttribute("href", quiz);
  for (const name of ["教材を開く", "小テストを開く"]) {
    const link = page.getByRole("link", { name, exact: true });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
  await expect(page.getByRole("link", { name: "授業設定", exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("approved-links-home.png"), fullPage: true, caret: "initial" });
  // Keep this regression offline while exercising navigation out of an LTI frame.
  for (const url of [material, quiz]) {
    await context.route(url, route => route.fulfill({ contentType: "text/html", body: "<h1>External destination fixture</h1>" }));
  }
  await page.route("**/lti-frame-fixture", route => route.fulfill({
    contentType: "text/html", body: '<iframe title="LTI fixture" src="/"></iframe>',
  }));
  await page.goto("/lti-frame-fixture");
  const home = page.frameLocator('iframe[title="LTI fixture"]');
  for (const [name, url] of [["教材を開く", material], ["小テストを開く", quiz]]) {
    const popupReady = page.waitForEvent("popup");
    await home.getByRole("link", { name, exact: true }).click();
    const popup = await popupReady;
    await expect(popup).toHaveURL(url);
    await expect(popup.getByRole("heading")).toHaveText("External destination fixture");
    expect(await popup.evaluate(() => window.opener === null)).toBe(true);
    await expect(home.getByRole("heading", { name: "今日やること", exact: true })).toBeVisible();
    await popup.close();
  }
  await login("teacher", `unapproved-links-${info.project.name}`);
  await page.goto("/teacher/training");
  await page.getByRole("radio", { name: "BtoB研修型" }).check();
  await expect(page.locator("#training-material-1 option")).toHaveCount(1);
  await expect(page.locator("#training-quiz-1 option")).toHaveCount(1);
});

test("signed roster seat reassignment, monitor and authorization", async ({ page, context, baseURL }, info) => {
  const url = new URL(process.env.DATABASE_ADMIN_URL!);
  if (process.env.TRAINING_DB_TEST !== "1" || url.hostname !== "127.0.0.1" || url.pathname !== "/aischool_test") {
    throw new Error("Isolated database required for roster fixtures");
  }
  const studentId = `seat-student-${info.project.name}`;
  const displayName = `座席検証受講生-${info.project.name}`;
  const courseId = "seat-test-course";
  const db = new pg.Client({ connectionString: url.href });
  await db.connect();
  try {
    await db.query(`INSERT INTO students (id,display_name,first_seen_at,last_seen_at) VALUES ($1,$2,now(),now())`, [studentId, displayName]);
    await db.query(`INSERT INTO student_courses (student_id,course_id,last_seen_at) VALUES ($1,$2,now())`, [studentId, courseId]);
    await db.query(`INSERT INTO device_assignments (seat_no,nuc_id,monitor_id,student_id,using_backup)
      VALUES (1,'TEST-NUC-01','TEST-MON-01',NULL,false),(2,'TEST-NUC-02','TEST-MON-02',NULL,false),(16,'TEST-NUC-16','TEST-MON-16',NULL,false)
      ON CONFLICT (seat_no) DO UPDATE SET student_id=NULL,using_backup=false`);
    await db.query("UPDATE device_assignments SET student_id=$1 WHERE seat_no=1", [studentId]);
  } finally { await db.end(); }
  async function login(role: "teacher" | "admin" | "student") {
    const value = await signSession({ sub: `seat-test-${role}`, role, courseId }, process.env.LTI_SESSION_SECRET!);
    await context.addCookies([{ name: "lti_session", value, url: baseURL! }]);
  }
  const post = (seatNo: string, data: unknown, origin: string | null = baseURL!) =>
    context.request.post(`/api/devices/${seatNo}/student`, {
      headers: origin === null ? {} : { origin }, data,
    });
  await login("teacher");
  await page.goto("/teacher/devices");
  const seat2 = page.getByLabel("座席2の割当", { exact: true });
  await seat2.getByLabel("座席2の受講生", { exact: true }).selectOption({ label: displayName });
  await seat2.getByRole("button", { name: "保存", exact: true }).click();
  await expect(seat2.getByText("保存しました", { exact: true })).toBeVisible();
  await expect(seat2.getByRole("combobox")).toHaveValue(studentId);
  await expect(page.getByLabel("座席1の割当", { exact: true }).getByRole("cell", { name: "空席", exact: true })).toBeVisible();
  await page.goto("/teacher/monitor");
  await expect(page.getByRole("region", { name: `座席2 ${displayName}`, exact: true })).toBeVisible();
  await login("admin");
  await page.goto("/admin/audit");
  await expect(page.locator("body")).toContainText("device_assignment / seat-2");

  for (const origin of [null, "https://untrusted.example.test"]) {
    expect((await post("2", { studentId: null }, origin)).status()).toBe(403);
  }
  for (const data of [{ studentId: "not-on-roster" }, { studentId: 42 }, {}]) {
    expect((await post("2", data)).status()).toBe(400);
  }
  expect((await post("invalid", { studentId })).status()).toBe(400);
  expect((await post("17", { studentId })).status()).toBe(404);
  await login("student");
  expect((await post("2", { studentId: null })).status()).toBe(403);
  await context.clearCookies();
  expect((await post("2", { studentId: null })).status()).toBe(403);
  await login("teacher");
  const unchanged = await post("2", { studentId });
  expect(unchanged.status()).toBe(200);
  expect(await unchanged.json()).toMatchObject({ changed: false, studentId });
  expect((await post("16", { studentId })).status()).toBe(200);
  await page.goto("/teacher/devices");
  await expect(page.getByLabel("座席2の割当", { exact: true }).getByRole("cell", { name: "空席", exact: true })).toBeVisible();
  expect((await post("16", { studentId: null })).status()).toBe(200);
  await page.reload();
  await expect(page.getByLabel("座席16の割当", { exact: true }).getByRole("cell", { name: "空席", exact: true })).toBeVisible();
});

test("signed device switch, audit, validation and origin protection", async ({ page, context, baseURL }) => {
  const url = new URL(process.env.DATABASE_ADMIN_URL!);
  if (process.env.TRAINING_DB_TEST !== "1" || url.hostname !== "127.0.0.1" || url.pathname !== "/aischool_test") {
    throw new Error("Isolated database required for device fixtures");
  }
  const db = new pg.Client({ connectionString: url.href });
  await db.connect();
  try {
    await db.query(`INSERT INTO device_assignments (seat_no,nuc_id,monitor_id,student_id,using_backup)
      VALUES (1,'TEST-NUC-01','TEST-MON-01',NULL,false),(16,'TEST-NUC-16','TEST-MON-16',NULL,false)
      ON CONFLICT (seat_no) DO UPDATE SET using_backup=false`);
  } finally { await db.end(); }

  async function login(role: "teacher" | "admin" | "student") {
    const value = await signSession({ sub: `device-test-${role}`, role, courseId: "device-test-course" }, process.env.LTI_SESSION_SECRET!);
    await context.addCookies([{ name: "lti_session", value, url: baseURL! }]);
  }
  await login("teacher");
  await page.goto("/teacher/devices");
  const seat = page.getByLabel("座席1の割当", { exact: true });
  await seat.getByRole("button", { name: "予備機に切替", exact: true }).click();
  await expect(seat.getByRole("button", { name: "主モニターに戻す", exact: true })).toBeVisible();
  await seat.getByRole("button", { name: "主モニターに戻す", exact: true }).click();
  await expect(seat.getByRole("button", { name: "予備機に切替", exact: true })).toBeVisible();

  const post = (seatNo: string, usingBackup: unknown, origin: string | null = baseURL!) =>
    context.request.post(`/api/devices/${seatNo}/backup`, {
      headers: origin === null ? {} : { origin }, data: { usingBackup },
    });
  for (const origin of [null, "https://untrusted.example.test"]) {
    expect((await post("1", true, origin)).status()).toBe(403);
  }
  expect((await post("1", "yes")).status()).toBe(400);
  expect((await post("invalid", true)).status()).toBe(400);
  expect((await post("16", true)).status()).toBe(200);
  expect((await post("17", true)).status()).toBe(404);
  const unchanged = await post("1", false);
  expect(unchanged.status()).toBe(200);
  expect(await unchanged.json()).toMatchObject({ changed: false, usingBackup: false });

  await login("admin");
  await page.goto("/admin/audit");
  await expect(page.locator("body")).toContainText("device_assignment / seat-1");
  await login("student");
  expect((await post("1", true)).status()).toBe(403);
  await context.clearCookies();
  expect((await post("1", true)).status()).toBe(403);
});

test("training settings save, student home, permissions and conflicts", async ({ page, context, baseURL }, info) => {
  const courseId = `training-e2e-${info.project.name}`;
  async function login(role: "teacher" | "student") {
    const value = await signSession({ sub: `fictional-${role}`, role, courseId }, process.env.LTI_SESSION_SECRET!);
    await context.addCookies([{ name: "lti_session", value, url: baseURL! }]);
  }
  await login("teacher");
  await page.goto("/");
  await page.getByRole("link", { name: "授業設定", exact: true }).click();
  await page.getByRole("radio", { name: "BtoB研修型" }).check();
  await page.getByLabel("第1回の授業名", { exact: true }).fill("架空の業務研修");
  await page.getByLabel("現在の授業", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("保存しました");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("training-settings.png"), fullPage: true });
  const invalid = await context.request.post("/api/teacher/training", { headers: { origin: baseURL! },
    data: { courseId, mode: "btob", revision: 1, currentDay: 11, days: [] } });
  expect(invalid.status()).toBe(400);
  const stale = await context.request.post("/api/teacher/training", { headers: { origin: baseURL! },
    data: { courseId, mode: "btob", revision: 0, currentDay: null, days: [] } });
  expect(stale.status()).toBe(409);
  await login("student");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "第1回：架空の業務研修" })).toBeVisible();
  await expect(page.getByText("教材：準備中", { exact: true })).toBeVisible();
  await expect(page.getByText("小テスト：準備中", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "授業設定", exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("training-home.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const denied = await context.request.post("/api/teacher/training", { headers: { origin: baseURL! }, data: {} });
  expect(denied.status()).toBe(403);
});

test("unconfigured and legacy courses keep the existing home", async ({ page, context, baseURL }, info) => {
  const courseId = `training-legacy-${info.project.name}`;
  const value = await signSession({ sub: "fictional-legacy-teacher", role: "teacher", courseId }, process.env.LTI_SESSION_SECRET!);
  await context.addCookies([{ name: "lti_session", value, url: baseURL! }]);
  await page.goto("/");
  await expect(page.getByText("未提出の課題を、締切が近い順に並べています。", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "授業設定", exact: true }).click();
  await page.getByRole("radio", { name: "BtoB研修型" }).check();
  await expect(page.getByLabel("現在の授業", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("保存しました");
  await page.goto("/");
  await expect(page.getByText("現在の授業はまだ選択されていません。", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "現在の授業", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "授業設定", exact: true }).click();
  await page.getByRole("radio", { name: "従来の演習型" }).check();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("保存しました");
  await page.goto("/");
  await expect(page.getByText("未提出の課題を、締切が近い順に並べています。", { exact: true })).toBeVisible();
});
