import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import pg from "pg";
import { signSession } from "../src/lib/lti/session";
import type { Role } from "./helpers";

export async function prepareReport() {
  const db = new URL(process.env.DATABASE_ADMIN_URL!);
  const origin = new URL(process.env.LTI_TOOL_URL!).origin;
  if (process.env.TRAINING_DB_TEST !== "1" || db.hostname !== "127.0.0.1" ||
      db.pathname !== "/aischool_test" || new URL(origin).hostname !== "localhost" ||
      !process.env.LTI_SESSION_SECRET) throw new Error("Isolated signed-session harness required");
  const courseId = `report-${randomUUID()}`;
  const studentId = `${courseId}-student`;
  const client = new pg.Client({ connectionString: db.href });
  await client.connect();
  try {
    await client.query(`INSERT INTO students (id,display_name,first_seen_at,last_seen_at)
      VALUES ($1,'Report test student',now(),now())`, [studentId]);
    await client.query(`INSERT INTO student_courses (student_id,course_id,last_seen_at)
      VALUES ($1,$2,now())`, [studentId, courseId]);
    await client.query(`INSERT INTO assignments (id,title,description,char_limit,deadline)
      VALUES ($1,'お店の紹介文をAIに書かせよう','Report fixture',2000,'2026-10-25T23:59:00+09:00')`, [courseId]);
    await client.query(`INSERT INTO submissions
      (id,course_id,target_week,assignment_id,student_id,status,version,prompt_text,ai_output_text,
       reflection_text,is_late,has_deviation,versions)
      VALUES ($1,$1,'2026-10-19',$1,$2,'in_progress',1,'','','',false,false,'[]')`, [courseId, studentId]);
    await client.query(`INSERT INTO course_lesson_records
      (course_id,student_id,lesson_id,week_start,attended,submitted,score)
      VALUES ($1,$2,'report-lesson','2026-10-19',true,false,NULL)`, [courseId, studentId]);
  } finally { await client.end(); }
  async function headers(role: Role = "admin") {
    if (role === "guest") return { origin, cookie: "" };
    const token = await signSession({ sub: role === "student" ? studentId : `report-${role}`, role, courseId }, process.env.LTI_SESSION_SECRET!);
    return { origin, cookie: `lti_session=${token}` };
  }
  async function setRole(page: Page, role: Role) {
    await page.context().clearCookies();
    const auth = await headers(role);
    if (auth.cookie) await page.context().addCookies([
      { name: "lti_session", value: auth.cookie.slice("lti_session=".length), url: origin },
    ]);
  }
  return { headers, setRole, studentId, assignmentId: courseId };
}
