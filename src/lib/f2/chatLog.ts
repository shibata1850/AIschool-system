import { and, desc, eq } from "drizzle-orm";
import { inCourse } from "@/lib/course/query";
import { getDb } from "@/lib/db/client";
import { chatLogs, teacherMessages } from "@/lib/db/schema";
import { TEACHER_MESSAGE_LIMIT } from "./constants";
import type { CurrentUser } from "@/lib/auth";
import { canReadAllCourses } from "@/lib/course/access";

/**
 * AI講師の会話ログ（F2）と、講師から受講生への一言（S6の介入導線）。
 *
 * **どちらも保存するのはマスキング済みの本文だけ**。原文は保持しない。
 * 保持期間は在籍＋退会後3年（未決#10で確定）で、退会時は `purgeStudentData` が消す。
 */

export interface ChatLogEntry {
  id: number;
  studentId: string;
  askedAt: string;
  maskedQuestion: string;
  reply: string | null;
  blocked: boolean;
  piiDetected: boolean;
  elapsedMs: number | null;
  model: string | null;
}

/** 1件の会話を記録する。**呼び出し側はマスキング済みの本文を渡すこと** */
export async function recordChatLog(entry: {
  studentId: string;
  courseId?: string | null;
  maskedQuestion: string;
  reply?: string;
  blocked: boolean;
  piiDetected: boolean;
  elapsedMs?: number;
  model?: string;
}): Promise<void> {
  const db = getDb();
  await db.insert(chatLogs).values({
    studentId: entry.studentId,
    courseId: entry.courseId ?? null,
    askedAt: new Date(),
    maskedQuestion: entry.maskedQuestion,
    reply: entry.reply ?? null,
    blocked: entry.blocked,
    piiDetected: entry.piiDetected,
    elapsedMs: entry.elapsedMs ?? null,
    model: entry.model ?? null,
  });
}

/** 受講生1名分の会話ログを新しい順に返す（本人・講師・管理者が見る） */
export async function listChatLogs(
  studentId: string,
  limit = 100,
  courseId: string | null = null,
): Promise<ChatLogEntry[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(chatLogs)
    .where(and(eq(chatLogs.studentId, studentId), inCourse(chatLogs.courseId, courseId)))
    .orderBy(desc(chatLogs.askedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    studentId: r.studentId,
    askedAt: r.askedAt.toISOString(),
    maskedQuestion: r.maskedQuestion,
    reply: r.reply,
    blocked: r.blocked,
    piiDetected: r.piiDetected,
    elapsedMs: r.elapsedMs,
    model: r.model,
  }));
}

/**
 * 記録がある受講生ID を新しい順に返す。
 *
 * **架空の名簿（fixtures）を順に引いてはいけない**。本番はLTI運用で、
 * `getCurrentUser()` が返すのはCanvasの実利用者IDであり架空名簿に無い。
 * 名簿を起点にすると、保存されているのに0件に見える
 * （2026-09-02 に本番で実際に踏んだ）。**テーブルにある物を起点にする。**
 */
export async function listStudentsWithChatLogs(courseId: string | null = null): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ studentId: chatLogs.studentId })
    .from(chatLogs)
    .where(inCourse(chatLogs.courseId, courseId));
  return rows.map((r) => r.studentId).sort();
}

/** Staff-only reads include legacy logs without a course; student reads stay scoped. */
export async function listStaffChatLogs(actor: CurrentUser): Promise<{
  studentId: string;
  logs: ChatLogEntry[];
}[]> {
  if (!canReadAllCourses(actor)) throw new Error("Forbidden");
  const db = getDb();
  const students = await db.selectDistinct({ studentId: chatLogs.studentId }).from(chatLogs);
  return Promise.all(students.sort((a, b) => a.studentId.localeCompare(b.studentId)).map(async ({ studentId }) => {
    const rows = await db.select().from(chatLogs)
      .where(eq(chatLogs.studentId, studentId))
      .orderBy(desc(chatLogs.askedAt), desc(chatLogs.id)).limit(50);
    return { studentId, logs: rows.map(row => ({ ...row, askedAt: row.askedAt.toISOString() })) };
  }));
}

/** 退会者データ削除（F5②）で使う */
export async function purgeChatLogs(studentId: string): Promise<number> {
  const db = getDb();
  const deleted = await db
    .delete(chatLogs)
    .where(eq(chatLogs.studentId, studentId))
    .returning({ id: chatLogs.id });
  return deleted.length;
}

// ---------- 講師から受講生への一言 ----------

export interface TeacherMessage {
  id: number;
  studentId: string;
  sentAt: string;
  sentBy: string | null;
  body: string;
}

export class TeacherMessageError extends Error {}

/**
 * 講師から受講生へ一言送る。
 * 入力検証はここで行う（APIとテストの両方から同じ規則を使うため）。
 */
export async function sendTeacherMessage(input: {
  studentId: string;
  courseId?: string | null;
  body: string;
  sentBy?: string;
}): Promise<TeacherMessage> {
  const body = input.body ?? "";
  if (body.trim().length === 0) {
    throw new TeacherMessageError("メッセージを入力してください");
  }
  if (body.length > TEACHER_MESSAGE_LIMIT) {
    throw new TeacherMessageError(
      `メッセージは${TEACHER_MESSAGE_LIMIT.toLocaleString("ja-JP")}文字以内で入力してください`,
    );
  }
  if (input.studentId.trim().length === 0) {
    throw new TeacherMessageError("宛先の受講生を指定してください");
  }

  const db = getDb();
  const [row] = await db
    .insert(teacherMessages)
    .values({
      studentId: input.studentId,
      courseId: input.courseId ?? null,
      sentAt: new Date(),
      sentBy: input.sentBy ?? null,
      // 前後の空白だけ落とす。改行はプロンプト本文で意味を持つため保つ
      body: body.trim(),
    })
    .returning();
  return {
    id: row.id,
    studentId: row.studentId,
    sentAt: row.sentAt.toISOString(),
    sentBy: row.sentBy,
    body: row.body,
  };
}

/** 受講生1名分の受信メッセージを新しい順に返す */
export async function listTeacherMessages(
  studentId: string,
  limit = 20,
  courseId: string | null = null,
): Promise<TeacherMessage[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(teacherMessages)
    .where(and(eq(teacherMessages.studentId, studentId), inCourse(teacherMessages.courseId, courseId)))
    .orderBy(desc(teacherMessages.sentAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    studentId: r.studentId,
    sentAt: r.sentAt.toISOString(),
    sentBy: r.sentBy,
    body: r.body,
  }));
}

/** 退会者データ削除（F5②）で使う */
export async function purgeTeacherMessages(studentId: string): Promise<number> {
  const db = getDb();
  const deleted = await db
    .delete(teacherMessages)
    .where(eq(teacherMessages.studentId, studentId))
    .returning({ id: teacherMessages.id });
  return deleted.length;
}
