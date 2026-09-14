import type { CurrentUser } from "@/lib/auth";
import { canReadAllCourses, teacherCourseAccess } from "@/lib/course/access";
import { getDb } from "@/lib/db/client";
import { studentCourses } from "@/lib/db/schema";
import { getRoster } from "@/lib/roster";
import { isAttendedWithoutSubmission } from "@/lib/f4/fixtures";
import { CURRENT_ASSIGNMENT_ID, findSubmission, getLessonRecords } from "./store";
import type { ExerciseStatus } from "./types";

export async function getStaffMonitor(actor: CurrentUser) {
  if (!canReadAllCourses(actor)) throw new Error("Forbidden");
  const access = teacherCourseAccess(actor);
  const [roster, memberships] = await Promise.all([
    getRoster(),
    getDb().select({ studentId: studentCourses.studentId, courseId: studentCourses.courseId }).from(studentCourses),
  ]);
  const coursesByStudent = new Map<string, Set<string>>();
  for (const membership of memberships) {
    const courses = coursesByStudent.get(membership.studentId) ?? new Set<string>();
    courses.add(membership.courseId);
    coursesByStudent.set(membership.studentId, courses);
  }
  return Promise.all(roster.map(async student => {
    const recorded = [...(coursesByStudent.get(student.id) ?? [])].sort();
    const courses: (string | null)[] = recorded.length ? recorded : [null];
    const states = await Promise.all(courses.map(async courseId => {
      const [submission, records] = await Promise.all([
        findSubmission(CURRENT_ASSIGNMENT_ID, student.id, courseId),
        getLessonRecords(student.id, courseId),
      ]);
      return {
        courseId,
        status: (submission?.status ?? "not_started") as ExerciseStatus,
        attendedNoSubmit: isAttendedWithoutSubmission(records),
      };
    }));
    return { student, states, canMessage: !!access &&
      (access.courseId === null || recorded.includes(access.courseId)) };
  }));
}
