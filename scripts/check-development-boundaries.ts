import assert from "node:assert/strict";
import { projectUrl, shortText } from "../src/lib/development/policy";
import { readDevelopment, listDevelopment, saveDevelopment, DevelopmentError } from "../src/lib/development/store";
import type { CurrentUser } from "../src/lib/auth";

// This check never reaches the database: every request must fail at the access boundary.
async function main() {
  let count = 0;
  for (const url of ["javascript:alert(1)", "http://example.com", "https://user:secret@example.com", "https://example.com/?token=secret", "https://example.com/#secret", "https://localhost", "https://example.com/ bad"]) {
    assert.equal(projectUrl(url), undefined); count++;
  }
  assert.equal(projectUrl("https://example.com/project"), "https://example.com/project"); count++;
  assert.equal(projectUrl(null), null); count++;
  assert.equal(shortText("a\u0000b", 10), false); count++;
  assert.equal(shortText("a".repeat(1001), 1000), false); count++;
  const student: CurrentUser = { role: "student", userId: "fictional-a", viaLti: true, courseId: "fictional-course-a" };
  const teacher: CurrentUser = { ...student, role: "teacher" };
  const input = { kind: "project", courseId: student.courseId, studentId: student.userId, revision: 0 };
  async function denied(work: () => Promise<unknown>) {
    await assert.rejects(work, (error: unknown) => error instanceof DevelopmentError && error.status === 403); count++;
  }
  await denied(() => saveDevelopment(student, { ...input, studentId: "fictional-b" }));
  await denied(() => saveDevelopment(student, { ...input, courseId: "fictional-course-b" }));
  await denied(() => saveDevelopment(student, { ...input, kind: "attendance" }));
  await denied(() => saveDevelopment(student, { ...input, kind: "resolve" }));
  await denied(() => saveDevelopment({ ...student, viaLti: false }, input));
  await denied(() => saveDevelopment(teacher, input));
  await denied(() => saveDevelopment(teacher, { ...input, kind: "attendance", courseId: "fictional-course-b" }));
  await denied(() => readDevelopment(student, "fictional-course-a", "fictional-b", 1));
  await denied(() => readDevelopment(student, "fictional-course-b", student.userId, 1));
  await denied(() => listDevelopment(student, "fictional-course-a", 1));
  console.log(`DEVELOPMENT_BOUNDARIES_PASS ${count} checks; no database reads or writes`);
}
main().catch(() => { console.error("DEVELOPMENT_BOUNDARIES_FAILED"); process.exitCode = 1; });
