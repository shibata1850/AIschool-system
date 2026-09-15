import { test, expect, type Page } from "@playwright/test";
import { SignJWT } from "jose";
import pg from "pg";

// These credentials and records exist only in a fresh loopback test database.
const databaseUrl = new URL(process.env.DATABASE_ADMIN_URL ?? "");
if (process.env.LOCAL_COURSE_ISOLATION !== "1" ||
    databaseUrl.hostname !== "127.0.0.1" || databaseUrl.pathname !== "/aischool_test" ||
    !process.env.LTI_SESSION_SECRET) {
  throw new Error("Isolated local DB and generated test session secret required");
}
const courseA = "fictional-course-a";
const courseB = "fictional-course-b";
const studentA = "fictional-student-a";
const studentB = "fictional-student-b";
const submissionA = "fictional-submission-a";
const submissionB = "fictional-submission-b";

async function query(sql: string, values: unknown[] = []) {
  const client = new pg.Client({ connectionString: databaseUrl.toString() });
  await client.connect();
  try { return await client.query(sql, values); }
  finally { await client.end(); }
}

async function login(page: Page, courseId: string | undefined = courseA, role: "teacher" | "student" = "teacher") {
  const token = await new SignJWT({ role, courseId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("fictional-teacher-a")
    .setIssuedAt().setExpirationTime("10m")
    .sign(new TextEncoder().encode(process.env.LTI_SESSION_SECRET));
  await page.context().addCookies([{ name: "lti_session", value: token, domain: "localhost", path: "/" }]);
}

test.beforeEach(async ({ request, page }) => {
  const resetToken = await new SignJWT({ role: "teacher", courseId: courseA })
    .setProtectedHeader({ alg: "HS256" }).setSubject("fictional-test-reset")
    .setIssuedAt().setExpirationTime("10m")
    .sign(new TextEncoder().encode(process.env.LTI_SESSION_SECRET));
  expect((await request.post("/api/dev/reset", { headers: { cookie: `lti_session=${resetToken}` } })).ok()).toBe(true);
  for (const [student, course, name, submission] of [
    [studentA, courseA, "架空コースA受講生", submissionA],
    [studentB, courseB, "架空コースB受講生", submissionB],
  ]) {
    await query("INSERT INTO students (id, display_name, first_seen_at, last_seen_at) VALUES ($1,$2,now(),now())", [student, name]);
    await query("INSERT INTO student_courses (student_id, course_id, last_seen_at) VALUES ($1,$2,now())", [student, course]);
    await query(`INSERT INTO submissions
      (id, assignment_id, student_id, status, version, prompt_text, ai_output_text,
       reflection_text, is_late, has_deviation, versions)
      VALUES ($1,'a1',$2,'submitted',1,$3,'架空の回答','架空の振り返り',false,false,'[]')`,
    [submission, student, `${name}の架空提出`]);
    await query(`INSERT INTO chat_logs
      (student_id, asked_at, masked_question, reply, blocked, pii_detected, elapsed_ms)
      VALUES ($1,now(),$2,'架空の回答',false,false,1200)`, [student, `${name}の質問`]);

    // The same regression can run against the pre-migration baseline.
    for (const table of ["submissions", "chat_logs"]) {
      const columns = await query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='course_id'", [table]);
      if (columns.rowCount) {
        if (table === "submissions") await query("UPDATE submissions SET course_id=$1 WHERE id=$2", [course, submission]);
        else await query("UPDATE chat_logs SET course_id=$1 WHERE student_id=$2", [course, student]);
      }
    }
  }
  await login(page);
});

test("student legacy history is read-only and never accepts a different owner from the URL", async ({ page }) => {
  await query("UPDATE submissions SET course_id=NULL WHERE id=$1", [submissionA]);
  await query("UPDATE chat_logs SET course_id=NULL WHERE student_id IN ($1,$2)", [studentA, studentB]);
  for (const id of [studentA, studentB]) {
    await query("INSERT INTO teacher_messages (student_id,sent_at,body) VALUES ($1,now(),$2)",
      [id, id === studentA ? "旧メッセージ1行目\n旧メッセージ2行目" : "別人の旧メッセージ"]);
    await query(`INSERT INTO lesson_records (student_id,lesson_id,week_start,attended,submitted,score)
      VALUES ($1,'legacy-lesson','2026-08-31',true,true,0)`, [id]);
  }
  const token = await new SignJWT({ role: "student", courseId: courseA })
    .setProtectedHeader({ alg: "HS256" }).setSubject(studentA)
    .setIssuedAt().setExpirationTime("10m")
    .sign(new TextEncoder().encode(process.env.LTI_SESSION_SECRET));
  await page.context().addCookies([{ name: "lti_session", value: token, domain: "localhost", path: "/" }]);
  await page.goto("/");
  await page.getByRole("link", { name: "旧履歴", exact: true }).click();
  await expect(page.getByRole("heading", { name: "旧履歴", exact: true })).toBeVisible();
  await page.getByText("提出内容", { exact: true }).click();
  await expect(page.getByText("架空コースA受講生の架空提出", { exact: true })).toBeVisible();
  await expect(page.getByText("架空コースB受講生の質問", { exact: true })).toHaveCount(0);
  const message = page.getByText("旧メッセージ1行目\n旧メッセージ2行目", { exact: true });
  await expect(message).toHaveCSS("white-space", "pre-wrap");
  await expect(page.getByRole("region", { name: "過去の授業記録" })).toContainText("スコア: 0");
  await expect(page.locator("main form, main button")).toHaveCount(0);
  await page.goto(`/achievement/history?studentId=${studentB}&course=fictional-course-b`);
  await expect(page.getByText("架空コースA受講生の質問", { exact: true })).toBeVisible();
  await expect(page.getByText("別人の旧メッセージ", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.context().clearCookies();
  const response = await page.goto("/achievement/history");
  expect(response?.status()).toBe(403);
});

test("staff review shows both courses while other-course actions remain unavailable", async ({ page }) => {
  await page.goto("/teacher/review");
  await expect(page.getByText("架空コースA受講生の架空提出", { exact: true })).toBeVisible();
  await expect(page.getByText("架空コースB受講生の架空提出", { exact: true })).toBeVisible();
  const other = page.getByRole("region", { name: `提出 ${submissionB}`, exact: true });
  await expect(other.getByText("閲覧のみ（起動元コース外の提出）", { exact: true })).toBeVisible();
  await expect(other.getByRole("button")).toHaveCount(0);
});

test("assigned teaching week keeps a late grade visible before and after attendance", async ({ page }) => {
  await query("UPDATE submissions SET target_week='2026-09-07', status='completed', teacher_score=80, submitted_at='2026-10-01T00:00:00Z' WHERE id=$1", [submissionA]);
  const token = await new SignJWT({ role: "student", courseId: courseA })
    .setProtectedHeader({ alg: "HS256" }).setSubject(studentA)
    .setIssuedAt().setExpirationTime("10m")
    .sign(new TextEncoder().encode(process.env.LTI_SESSION_SECRET));
  await page.context().addCookies([{ name: "lti_session", value: token, domain: "localhost", path: "/" }]);
  await page.goto("/achievement");
  const week = page.getByRole("listitem", { name: "2026-09-07の週", exact: true });
  await expect(week).toContainText("到達度 85");
  await expect(week).toContainText("出席率 未記録");
  await expect(week).toContainText("提出率 100%");
  await expect(page.getByRole("listitem", { name: "2026-09-28の週", exact: true })).toHaveCount(0);
  await login(page);
  const response = await page.request.post("/api/teacher/attendance", {
    data: { studentId: studentA, weekStart: "2026-09-07", attended: true },
  });
  expect(response.status()).toBe(200);
  await page.context().addCookies([{ name: "lti_session", value: token, domain: "localhost", path: "/" }]);
  await page.reload();
  await expect(week).toContainText("到達度 88");
  await expect(week).toContainText("出席率 100%");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await query("UPDATE submissions SET target_week='2099-01-05' WHERE id=$1", [submissionA]);
  await page.reload();
  await expect(page.getByRole("listitem", { name: "2099-01-05の週", exact: true })).toHaveCount(0);
  await expect(week).toContainText("対象課題なし");
  await query("UPDATE submissions SET target_week=NULL WHERE id=$1", [submissionA]);
  await page.reload();
  await expect(page.getByRole("status")).toHaveText("対象週未設定の課題: 1件（週ごとの集計対象外）");
  await login(page);
  await page.goto("/teacher/report");
  await expect(page.getByRole("region", { name: "対象週未設定の課題", exact: true }))
    .toContainText("架空コースA受講生: 1件");
  await query("UPDATE submissions SET target_week='2099-01-05' WHERE id=$1", [submissionA]);
  await page.reload();
  await expect(page.getByRole("region", { name: "対象週未設定の課題", exact: true })).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: "架空コースA受講生" })).toContainText("対象課題なし");
});

test("teacher selects a teaching week and reallocation preserves the original week", async ({ page }) => {
  const id = "fictional-week-allocation";
  await query("INSERT INTO students (id,display_name,first_seen_at,last_seen_at) VALUES ($1,$2,now(),now())",
    [id, "架空対象週受講生"]);
  await query("INSERT INTO student_courses (student_id,course_id,last_seen_at) VALUES ($1,$2,now())", [id, courseA]);
  await page.goto("/teacher/assignments");
  await page.getByLabel("対象週（月曜日）").fill("2026-09-07");
  await page.getByRole("combobox", { name: "課題", exact: true }).selectOption("a1");
  await page.getByRole("checkbox", { name: "架空対象週受講生", exact: true }).check();
  await page.getByRole("button", { name: "選択した1人に割り当てる", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("割り当てました（新規1件・割当済み0件）");
  const stored = await query("SELECT target_week,course_id FROM submissions WHERE student_id=$1", [id]);
  expect(stored.rows).toEqual([{ target_week: "2026-09-07", course_id: courseA }]);
  await page.getByLabel("対象週（月曜日）").fill("2026-09-14");
  await page.getByRole("button", { name: "選択した1人に割り当てる", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("割り当てました（新規0件・割当済み1件）");
  expect((await query("SELECT target_week,course_id FROM submissions WHERE student_id=$1", [id])).rows).toEqual(stored.rows);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("sixteen distinct students read and submit concurrently without mixing records", async ({ browser, baseURL, page }) => {
  test.setTimeout(180_000);
  const ids = Array.from({ length: 16 }, (_, i) => `fictional-concurrent-${i + 1}`);
  for (const id of ids) {
    await query("INSERT INTO students (id,display_name,first_seen_at,last_seen_at) VALUES ($1,$1,now(),now())", [id]);
    await query("INSERT INTO student_courses (student_id,course_id,last_seen_at) VALUES ($1,$2,now())", [id, courseA]);
    await query(`INSERT INTO submissions
      (id,assignment_id,student_id,course_id,status,version,prompt_text,ai_output_text,reflection_text,is_late,has_deviation,versions)
      VALUES ($1,'a1',$1,$2,'not_started',1,'','','',false,false,'[]')`, [id, courseA]);
  }
  const contexts = [];
  try {
    for (const id of ids) {
      const context = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
      contexts.push(context);
      const token = await new SignJWT({ role: "student", courseId: courseA })
        .setProtectedHeader({ alg: "HS256" }).setSubject(id).setIssuedAt().setExpirationTime("10m")
        .sign(new TextEncoder().encode(process.env.LTI_SESSION_SECRET));
      await context.addCookies([{ name: "lti_session", value: token, domain: "localhost", path: "/" }]);
    }
    const samples = await Promise.all(contexts.map(async (context, i) => {
      const studentPage = await context.newPage();
      const start = Date.now();
      const response = await studentPage.goto(baseURL!, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(200);
      const navigationMs = Date.now() - start;
      const submittedAt = Date.now();
      const submitted = await context.request.post(`${baseURL}/api/exercises/a1/submit`, {
        headers: { origin: new URL(baseURL!).origin },
        data: { promptText: `Fictional prompt ${ids[i]}`, reflectionText: "Fictional reflection", expectedVersion: 1 },
      });
      expect(submitted.status()).toBe(200);
      return { navigationMs, submissionMs: Date.now() - submittedAt };
    }));
    const stored = await query("SELECT student_id,prompt_text,status FROM submissions WHERE course_id=$1 AND student_id=ANY($2::text[])", [courseA, ids]);
    expect(stored.rows).toHaveLength(16);
    for (const id of ids) {
      const row = stored.rows.find(row => row.student_id === id);
      expect(row?.prompt_text).toBe(`Fictional prompt ${id}`);
      expect(row?.status).not.toBe("not_started");
    }
    const p90 = (values: number[]) => values.sort((a, b) => a - b)[Math.ceil(values.length * 0.9) - 1];
    console.log(JSON.stringify({ isolatedClients: 16, navigationP90Ms: p90(samples.map(s => s.navigationMs)), submissionP90Ms: p90(samples.map(s => s.submissionMs)), environment: "local-development-fixture" }));
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});

test("teacher switches a shared device through the browser", async ({ page }) => {
  await page.goto("/teacher/devices");
  await expect(page.getByRole("region", { name: "座席の割当表", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const seat = page.getByRole("row", { name: "座席1の割当", exact: true });
  await seat.getByRole("button", { name: "予備機に切替", exact: true }).click();
  await expect(seat.getByRole("button", { name: "主モニターに戻す", exact: true })).toBeVisible();
  const result = await query("SELECT using_backup FROM device_assignments WHERE seat_no=1");
  expect(result.rows[0].using_backup).toBe(true);
});

test("foreign origin cannot change a shared device", async ({ page }) => {
  const before = await query("SELECT using_backup, student_id FROM device_assignments WHERE seat_no=1");
  for (const [action, data] of [
    ["backup", { usingBackup: true }],
    ["student", { studentId: null }],
  ] as const) {
    const response = await page.request.post(`/api/devices/1/${action}`, {
      headers: { origin: "https://untrusted.invalid" }, data,
    });
    expect(response.status()).toBe(403);
  }
  const result = await query("SELECT using_backup, student_id FROM device_assignments WHERE seat_no=1");
  expect(result.rows).toEqual(before.rows);
});

test("student cannot change a shared device even with the correct origin", async ({ page, baseURL }) => {
  await login(page, courseA, "student");
  const before = await query("SELECT using_backup, student_id FROM device_assignments WHERE seat_no=1");
  for (const [action, data] of [
    ["backup", { usingBackup: true }],
    ["student", { studentId: null }],
  ] as const) {
    const response = await page.request.post(`/api/devices/1/${action}`, {
      headers: { origin: new URL(baseURL!).origin }, data,
    });
    expect(response.status()).toBe(403);
  }
  const after = await query("SELECT using_backup, student_id FROM device_assignments WHERE seat_no=1");
  expect(after.rows).toEqual(before.rows);
});

test("staff chat logs show both courses", async ({ page }) => {
  await page.goto("/teacher/chat-logs");
  await expect(page.getByText("質問: 架空コースA受講生の質問", { exact: true })).toBeVisible();
  await expect(page.getByText("質問: 架空コースB受講生の質問", { exact: true })).toBeVisible();
});

test("monitor shows all students but only offers messages for the launch course", async ({ page }) => {
  await page.goto("/teacher/monitor");
  const own = page.getByRole("region", { name: /架空コースA受講生/ });
  const other = page.getByRole("region", { name: /架空コースB受講生/ });
  await expect(own).toBeVisible();
  await expect(other).toBeVisible();
  await expect(own.getByRole("button", { name: "一言送る", exact: true })).toBeVisible();
  await expect(other.getByRole("button", { name: "一言送る", exact: true })).toHaveCount(0);
  await expect(other.getByText("閲覧のみ（起動元コース外の受講生）", { exact: true })).toBeVisible();
});

test("own-course message succeeds with line breaks", async ({ page }) => {
  const response = await page.request.post("/api/teacher/message", { data: { studentId: studentA, body: "架空の連絡\n次の手順を確認してください" } });
  expect(response.status()).toBe(200);
  const result = await query("SELECT count(*)::int AS count FROM teacher_messages WHERE student_id=$1 AND body=$2", [studentA, "架空の連絡\n次の手順を確認してください"]);
  expect(result.rows[0].count).toBe(1);
});

test("other-course message is rejected without creating a message", async ({ page }) => {
  const response = await page.request.post("/api/teacher/message", { data: { studentId: studentB, body: "架空の連絡", courseId: courseB } });
  expect(response.status()).toBe(403);
  const result = await query("SELECT count(*)::int AS count FROM teacher_messages WHERE student_id=$1", [studentB]);
  expect(result.rows[0].count).toBe(0);
});

test("other-course attendance is rejected without recording attendance", async ({ page }) => {
  const response = await page.request.post("/api/teacher/attendance", { data: { studentId: studentB, weekStart: "2026-09-07", attended: true, courseId: courseB } });
  expect(response.status()).toBe(403);
  const result = await query("SELECT count(*)::int AS count FROM lesson_records WHERE student_id=$1", [studentB]);
  expect(result.rows[0].count).toBe(0);
});

test("other-course review is rejected and submission remains unchanged", async ({ page }) => {
  const response = await page.request.post(`/api/submissions/${submissionB}/review`, { data: { action: "return", comment: "架空の差戻し", courseId: courseB } });
  expect([403, 404]).toContain(response.status());
  const result = await query("SELECT status, version, teacher_comment FROM submissions WHERE id=$1", [submissionB]);
  expect(result.rows[0]).toEqual({ status: "submitted", version: 1, teacher_comment: null });
});

test("teacher session without a course cannot send a message", async ({ page }) => {
  await page.context().clearCookies();
  // Empty course is intentional; no default argument fallback.
  await login(page, "");
  const response = await page.request.post("/api/teacher/message", { data: { studentId: studentA, body: "架空の連絡" } });
  expect(response.status()).toBe(403);
});

test("invalid message input is rejected within the own course", async ({ page }) => {
  const response = await page.request.post("/api/teacher/message", { data: { studentId: studentA, body: 42 } });
  expect(response.status()).toBe(400);
});

for (const path of ["/teacher/class", "/teacher/summary"]) {
  test(`Canvas catalog permits unlaunched course selection on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.getByRole("combobox", { name: "コース", exact: true }).selectOption("9");
    await page.getByRole("button", { name: "表示", exact: true }).click();
    await expect(page).toHaveURL(/course=9/);
    await expect(page.getByText("Fictional Canvas learner C", { exact: true })).toBeVisible();
    await expect(page.getByText("Fictional Canvas learner A", { exact: true })).toHaveCount(0);
  });
}

test("teacher without course cannot write a Canvas grade", async ({ page }) => {
  await page.context().clearCookies();
  await login(page, "");
  const response = await page.request.post("/api/teacher/grade", {
    data: { userId: 501, assignmentId: 900, score: 90, courseId: courseA },
  });
  expect(response.status()).toBe(403);
});

test("student cannot write a Canvas grade", async ({ page }) => {
  await page.context().clearCookies();
  await login(page, courseA, "student");
  const response = await page.request.post("/api/teacher/grade", {
    data: { userId: 501, assignmentId: 900, score: 90 },
  });
  expect(response.status()).toBe(403);
});
