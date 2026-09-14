import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { CurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { assignments, submissions, chatLogs, teacherMessages, lessonRecords } from "@/lib/db/schema";
import { courseAccess } from "./access";

export const LEGACY_PAGE_SIZE = 50;

export function legacyPageNumber(value: string | string[] | undefined): number | null {
  if (value === undefined) return 1;
  if (typeof value !== "string" || !/^[1-9]\d{0,5}$/.test(value)) return null;
  return Number(value);
}

/** Ownership comes only from the authenticated actor, never a query-string ID or roster alias. */
export async function readOwnLegacyHistory(actor: CurrentUser, page = 1) {
  if (!courseAccess(actor) || !actor.userId?.trim()) throw new Error("Forbidden");
  if (!Number.isInteger(page) || page < 1 || page > 999999) throw new Error("Invalid page");
  const db = getDb();
  const offset = (page - 1) * LEGACY_PAGE_SIZE;
  const [work, chats, messages, lessons] = await Promise.all([
    db.select({
      id: submissions.id, title: assignments.title, status: submissions.status,
      promptText: submissions.promptText, aiOutputText: submissions.aiOutputText,
      reflectionText: submissions.reflectionText, teacherScore: submissions.teacherScore,
      teacherComment: submissions.teacherComment, submittedAt: submissions.submittedAt,
      feedback: sql<string | null>`${submissions.aiGrade}->>'feedback'`,
    }).from(submissions).leftJoin(assignments, eq(assignments.id, submissions.assignmentId))
      .where(and(eq(submissions.studentId, actor.userId), isNull(submissions.courseId)))
      .orderBy(desc(submissions.submittedAt), desc(submissions.id)).limit(LEGACY_PAGE_SIZE + 1).offset(offset),
    db.select({ id: chatLogs.id, askedAt: chatLogs.askedAt,
      question: chatLogs.maskedQuestion, reply: chatLogs.reply }).from(chatLogs)
      .where(and(eq(chatLogs.studentId, actor.userId), isNull(chatLogs.courseId)))
      .orderBy(desc(chatLogs.askedAt), desc(chatLogs.id)).limit(LEGACY_PAGE_SIZE + 1).offset(offset),
    db.select({ id: teacherMessages.id, sentAt: teacherMessages.sentAt, body: teacherMessages.body })
      .from(teacherMessages)
      .where(and(eq(teacherMessages.studentId, actor.userId), isNull(teacherMessages.courseId)))
      .orderBy(desc(teacherMessages.sentAt), desc(teacherMessages.id)).limit(LEGACY_PAGE_SIZE + 1).offset(offset),
    db.select({ weekStart: lessonRecords.weekStart, attended: lessonRecords.attended,
      submitted: lessonRecords.submitted, score: lessonRecords.score, dataMissing: lessonRecords.dataMissing })
      .from(lessonRecords).where(eq(lessonRecords.studentId, actor.userId))
      .orderBy(desc(lessonRecords.weekStart)).limit(LEGACY_PAGE_SIZE + 1).offset(offset),
  ]);
  return {
    page, hasNext: [work, chats, messages, lessons].some(rows => rows.length > LEGACY_PAGE_SIZE),
    submissions: work.slice(0, LEGACY_PAGE_SIZE), chats: chats.slice(0, LEGACY_PAGE_SIZE),
    messages: messages.slice(0, LEGACY_PAGE_SIZE), lessons: lessons.slice(0, LEGACY_PAGE_SIZE),
  };
}
