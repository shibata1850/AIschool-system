import { beforeEach, describe, expect, it } from "vitest";
import { recordStudentLaunch, getRoster, listRecordedCourseIds } from "@/lib/roster";
import { allocateAssignment } from "@/lib/f3/allocation";
import { resetStore, findSubmission, getSubmissionById, hasAssignmentsForStudent, setAttendance, getAttendance, getLessonRecords, recordCompletionScore, purgeStudentData, getAllLessonRecords, getPendingAssignmentsByStudent } from "@/lib/f3/store";
import { recordChatLog, listChatLogs, listStudentsWithChatLogs, sendTeacherMessage, listTeacherMessages } from "@/lib/f2/chatLog";
import { saveMastery, getExternalMasteryForStudent } from "@/lib/integration/mastery";

const student = "fictional-shared-student";
const teacher = (courseId: string) => ({ role: "teacher" as const, userId: "fictional-teacher", viaLti: true, courseId });

describe("course-separated persistence", () => {
  beforeEach(async () => {
    await resetStore();
    await recordStudentLaunch({ id: student, displayName: "架空の複数コース受講生", courseId: "course-a" });
    await recordStudentLaunch({ id: student, displayName: "架空の複数コース受講生", courseId: "course-b" });
  });

  it("does not fall back to the global roster for an empty course", async () => {
    expect(await getRoster("course-empty")).toEqual([]);
    expect((await getRoster("course-a")).map(row => row.id)).toEqual([student]);
  });

  it("enumerates recorded courses once for the report batch", async () => {
    await recordStudentLaunch({ id: "fictional-second-student", courseId: "course-a" });
    expect(await listRecordedCourseIds()).toEqual(["course-a", "course-b"]);
  });

  it("allocates the same exercise separately for a student in two courses", async () => {
    expect(await allocateAssignment(teacher("course-a"), "a1", [student])).toEqual({ created: 1, skipped: 0 });
    expect(await allocateAssignment(teacher("course-b"), "a1", [student])).toEqual({ created: 1, skipped: 0 });
    const a = await findSubmission("a1", student, "course-a");
    const b = await findSubmission("a1", student, "course-b");
    expect(a?.courseId).toBe("course-a");
    expect(b?.courseId).toBe("course-b");
    expect(a?.id).not.toBe(b?.id);
    expect(await getSubmissionById(a!.id, "course-b")).toBeUndefined();
    expect(await findSubmission("a1", student)).toBeUndefined();
    expect(await hasAssignmentsForStudent(student, "course-empty")).toBe(false);
  });

  it("does not expose legacy submissions as shared course records", async () => {
    expect(await findSubmission("a1", "student-demo")).toBeDefined();
    expect(await findSubmission("a1", "student-demo", "course-a")).toBeUndefined();
  });

  it("separates the same student's conversations including unknown legacy ownership", async () => {
    for (const courseId of ["course-a", "course-b", null]) {
      await recordChatLog({ studentId: student, courseId, maskedQuestion: `Fictional ${courseId}`, reply: "Fictional reply", blocked: false, piiDetected: false });
    }
    expect((await listChatLogs(student, 100, "course-a")).map(row => row.maskedQuestion)).toEqual(["Fictional course-a"]);
    expect((await listChatLogs(student, 100, "course-b")).map(row => row.maskedQuestion)).toEqual(["Fictional course-b"]);
    expect((await listChatLogs(student)).map(row => row.maskedQuestion)).toEqual(["Fictional null"]);
    expect(await listStudentsWithChatLogs("course-empty")).toEqual([]);
  });

  it("separates received messages and preserves line breaks", async () => {
    await sendTeacherMessage({ studentId: student, courseId: "course-a", body: "架空の連絡A\n次の手順" });
    await sendTeacherMessage({ studentId: student, courseId: "course-b", body: "架空の連絡B" });
    expect((await listTeacherMessages(student, 20, "course-a")).map(row => row.body)).toEqual(["架空の連絡A\n次の手順"]);
    expect((await listTeacherMessages(student, 20, "course-b")).map(row => row.body)).toEqual(["架空の連絡B"]);
    expect(await listTeacherMessages(student)).toEqual([]);
  });

  it("records different attendance for the same student and week in two courses", async () => {
    await setAttendance(student, "2026-09-07", true, "course-a");
    await setAttendance(student, "2026-09-07", false, "course-b");
    expect(await getAttendance(student, "2026-09-07", "course-a")).toBe(true);
    expect(await getAttendance(student, "2026-09-07", "course-b")).toBe(false);
    expect(await getAttendance(student, "2026-09-07")).toBeUndefined();
  });

  it("serializes concurrent first attendance writes without duplicates", async () => {
    const results = await Promise.all(Array.from({ length: 16 }, () => setAttendance(student, "2026-09-07", true, "course-a")));
    expect(results.filter(result => result.changed)).toHaveLength(1);
    expect(await getLessonRecords(student, "course-a")).toHaveLength(1);
  });

  it("updates completion scores only within the submission's course", async () => {
    await setAttendance(student, "2026-09-07", true, "course-a");
    await setAttendance(student, "2026-09-14", true, "course-b");
    await recordCompletionScore(student, 87, "course-a");
    expect((await getLessonRecords(student, "course-a"))[0]).toMatchObject({ score: 87, submitted: true });
    expect((await getLessonRecords(student, "course-b"))[0]).toMatchObject({ score: null, submitted: false });
  });

  it("includes scoped lesson records in the existing retention cleanup", async () => {
    await setAttendance(student, "2026-09-07", true, "course-a");
    await setAttendance(student, "2026-09-07", false, "course-b");
    expect((await purgeStudentData(student)).hadLessonRecords).toBe(true);
    expect(await getLessonRecords(student, "course-a")).toEqual([]);
    expect(await getLessonRecords(student, "course-b")).toEqual([]);
  });

  it("separates weekly attendance sources for the same student", async () => {
    await setAttendance(student, "2026-09-07", true, "course-a");
    await setAttendance(student, "2026-09-07", false, "course-b");
    const a = (await getAllLessonRecords("course-a")).get(student);
    const b = (await getAllLessonRecords("course-b")).get(student);
    expect(a).toEqual(await getLessonRecords(student, "course-a"));
    expect(b).toEqual(await getLessonRecords(student, "course-b"));
    expect(a).not.toEqual(b);
    expect(await getAllLessonRecords("course-empty")).toEqual(new Map());
    expect((await getAllLessonRecords()).has(student)).toBe(false);
  });

  it("does not list pending assignments from another course or legacy data", async () => {
    await allocateAssignment(teacher("course-a"), "a1", [student]);
    expect((await getPendingAssignmentsByStudent("course-a")).get(student)).toHaveLength(1);
    expect(await getPendingAssignmentsByStudent("course-b")).toEqual(new Map());
    expect((await getPendingAssignmentsByStudent()).has(student)).toBe(false);
    expect((await getPendingAssignmentsByStudent("course-a")).has("student-demo")).toBe(false);
  });

  it("only reads external units assigned to the student in the requested course", async () => {
    await allocateAssignment(teacher("course-a"), "a1", [student]);
    await saveMastery([
      { studentId: student, unitId: "a1", score: 70, measuredAt: "2026-09-07T00:00:00Z" },
      { studentId: student, unitId: "fictional-unassigned", score: 99, measuredAt: "2026-09-07T00:00:00Z" },
    ]);
    expect((await getExternalMasteryForStudent(student, "course-a")).map(row => row.unitId)).toEqual(["a1"]);
    expect(await getExternalMasteryForStudent(student, "course-b")).toEqual([]);
    expect(await getExternalMasteryForStudent(student, "")).toEqual([]);
    expect(await getExternalMasteryForStudent(student)).toHaveLength(2);
  });
});
