import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { chatLogs, teacherMessages } from "@/lib/db/schema";
import { TEACHER_MESSAGE_LIMIT } from "./constants";

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
): Promise<ChatLogEntry[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(chatLogs)
    .where(eq(chatLogs.studentId, studentId))
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
): Promise<TeacherMessage[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(teacherMessages)
    .where(eq(teacherMessages.studentId, studentId))
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
