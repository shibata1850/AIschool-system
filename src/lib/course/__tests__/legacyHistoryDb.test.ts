import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { submissions, lessonRecords } from "@/lib/db/schema";
import { resetStore } from "@/lib/f3/store";
import { recordChatLog, sendTeacherMessage } from "@/lib/f2/chatLog";
import { readOwnLegacyHistory } from "../legacyHistory";

describe("legacy history database ownership", () => {
  beforeEach(async () => { await resetStore(); });
  it("returns only exact-owner legacy records, excluding other owners and every scoped record", async () => {
    const db = getDb();
    for (const [id, studentId, courseId] of [
      ["legacy-own", "fictional-owner", null],
      ["legacy-other", "fictional-other", null],
      ["scoped-own-a", "fictional-owner", "course-a"],
      ["scoped-own-b", "fictional-owner", "course-b"],
    ] as const) {
      await db.insert(submissions).values({ id, studentId, courseId, assignmentId: "a1", status: "completed",
        version: 1, promptText: id, aiOutputText: "Output", reflectionText: "Reflection",
        isLate: false, hasDeviation: false, teacherScore: 0, versions: [],
        aiGrade: { feedback: "Feedback", rationale: "PRIVATE STAFF REASON" },
      });
      await recordChatLog({ studentId, courseId, maskedQuestion: id, reply: id, blocked: false, piiDetected: false });
      await sendTeacherMessage({ studentId, courseId, body: id });
    }
    for (const studentId of ["fictional-owner", "fictional-other"]) {
      await db.insert(lessonRecords).values({ studentId, weekStart: "2026-08-31", lessonId: "old-lesson",
        attended: true, submitted: true, score: 0 });
    }
    const result = await readOwnLegacyHistory({ role: "student", viaLti: true, userId: "fictional-owner", courseId: "course-b" });
    expect(result.submissions.map(row => row.id)).toEqual(["legacy-own"]);
    expect(result.chats.map(row => row.question)).toEqual(["legacy-own"]);
    expect(result.messages.map(row => row.body)).toEqual(["legacy-own"]);
    expect(result.lessons).toHaveLength(1);
    expect(result.submissions[0].teacherScore).toBe(0);
    expect(JSON.stringify(result)).not.toContain("PRIVATE STAFF REASON");
    expect(result.hasNext).toBe(false);
  });
  it("paginates legacy messages without losing same-timestamp records", async () => {
    for (let i = 0; i < 51; i++) await sendTeacherMessage({ studentId: "fictional-pagination", body: `Message ${i}` });
    const actor = { role: "student" as const, viaLti: true, userId: "fictional-pagination", courseId: "course-a" };
    const first = await readOwnLegacyHistory(actor);
    const second = await readOwnLegacyHistory(actor, 2);
    expect(first.messages).toHaveLength(50);
    expect(second.messages).toHaveLength(1);
    expect(new Set([...first.messages, ...second.messages].map(row => row.id)).size).toBe(51);
    expect(first.hasNext).toBe(true);
    expect(second.hasNext).toBe(false);
  });
});
