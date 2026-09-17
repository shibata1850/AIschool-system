import type { Page } from "@playwright/test";
import pg from "pg";
import { signSession } from "../src/lib/lti/session";
import type { Role } from "./helpers";

function environment() {
  const db = new URL(process.env.DATABASE_ADMIN_URL!);
  const origin = new URL(process.env.LTI_TOOL_URL!).origin;
  if (process.env.TRAINING_DB_TEST !== "1" || db.hostname !== "127.0.0.1" ||
      db.pathname !== "/aischool_test" || new URL(origin).hostname !== "localhost" ||
      !process.env.LTI_SESSION_SECRET) throw new Error("Isolated signed-session harness required");
  return { db, origin };
}

export async function deviceHeaders(role: Role = "teacher") {
  const { origin } = environment();
  if (role === "guest") return { origin, cookie: "" };
  const token = await signSession({ sub: role === "student" ? "student-demo" : `device-${role}`, role, courseId: "device-course" }, process.env.LTI_SESSION_SECRET!);
  return { origin, cookie: `lti_session=${token}` };
}

export async function setDeviceRole(page: Page, role: Role) {
  const { origin } = environment();
  await page.context().clearCookies();
  const headers = await deviceHeaders(role);
  if (headers.cookie) await page.context().addCookies([
    { name: "lti_session", value: headers.cookie.slice("lti_session=".length), url: origin },
  ]);
}

export async function prepareDevices() {
  const { db } = environment();
  const client = new pg.Client({ connectionString: db.href });
  await client.connect();
  try {
    await client.query(`INSERT INTO students (id,display_name,first_seen_at,last_seen_at)
      VALUES ('student-demo','デモ生徒01',now(),now()) ON CONFLICT (id) DO NOTHING`);
    await client.query(`INSERT INTO student_courses (student_id,course_id,last_seen_at)
      VALUES ('student-demo','device-course',now()) ON CONFLICT DO NOTHING`);
    // Reset only the fictional seats in this newly created local database.
    await client.query(`INSERT INTO device_assignments (seat_no,nuc_id,monitor_id,student_id,using_backup)
      SELECT n,'NUC-'||lpad(n::text,2,'0'),'MON-'||lpad(n::text,2,'0'),NULL,false
      FROM generate_series(1,16) n ON CONFLICT (seat_no) DO UPDATE SET student_id=NULL,using_backup=false`);
    await client.query("UPDATE device_assignments SET student_id='student-demo' WHERE seat_no=1");
  } finally { await client.end(); }
}
