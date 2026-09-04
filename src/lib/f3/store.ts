import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  assignments as assignmentsTable,
  deviceAssignments as deviceAssignmentsTable,
  lessonRecords as lessonRecordsTable,
  submissions as submissionsTable,
  chatLogs as chatLogsTable,
  students as studentsTable,
  externalMastery as externalMasteryTable,
  teacherMessages as teacherMessagesTable,
} from "@/lib/db/schema";
import { resetDatabase } from "@/lib/db/seed";
import type { LessonRecord } from "@/lib/f4/achievement";
import type { Assignment, Submission } from "./types";

/**
 * データ永続化層（PostgreSQL・Drizzle）へのアクセスをここに閉じ込める。
 * 旧実装（インメモリMap）から移行。データはすべて架空値
 * （CLAUDE.md 2章: 実個人情報の使用禁止）。
 */

declare global {
  // eslint-disable-next-line no-var
  var __storeResetEpoch: number | undefined;
}

/**
 * このプロセスでの reset 回数（E2E・開発用のresetStore()のたびに増える）。
 * DBの版数チェック（updateSubmissionIfVersion）は複数プロセス間の競合に対応するが、
 * 「reset で全データを作り直した」場合は新しい行の版数が偶然一致し得るため検知できない
 * （resetDatabase()は毎回version=1からシードし直すため）。同一プロセス内での
 * reset-during-grading（採点中にE2Eリセットが走る等）はこのプロセス内カウンタで検知する。
 * 旧実装のインメモリ store のオブジェクト参照比較（`getStore() !== store`）に相当する。
 */
export function getResetEpoch(): number {
  return globalThis.__storeResetEpoch ?? 0;
}

/** いま教室で扱っている課題（モニタリングの対象。本番は授業コマから解決する） */
export const CURRENT_ASSIGNMENT_ID = "a1";

/** いま出席を取る授業コマの週（本番は授業コマから解決する） */
export const CURRENT_LESSON_WEEK = "2026-10-19";

/** デバイス割当（要件定義書6.1 device_assignments） */
export interface DeviceAssignment {
  seatNo: number;
  nucId: string;
  /** 2026-08-24 パンフレットv2でGOOVIS廃止。生徒の主画面（モバイルモニター）の識別子（旧 goovisId） */
  monitorId: string;
  /** 割当前・退会後は null（空席） */
  studentId: string | null;
  /** 主モニター不調時に予備機へ切替中か */
  usingBackup: boolean;
}

type SubmissionRow = typeof submissionsTable.$inferSelect;
type LessonRecordRow = typeof lessonRecordsTable.$inferSelect;

function toSubmission(row: SubmissionRow): Submission {
  return {
    id: row.id,
    assignmentId: row.assignmentId,
    studentId: row.studentId,
    status: row.status as Submission["status"],
    version: row.version,
    promptText: row.promptText,
    aiOutputText: row.aiOutputText,
    reflectionText: row.reflectionText,
    isLate: row.isLate,
    aiGrade: (row.aiGrade as Submission["aiGrade"] | null) ?? undefined,
    teacherScore: row.teacherScore ?? undefined,
    hasDeviation: row.hasDeviation,
    teacherComment: row.teacherComment ?? undefined,
    submittedAt: row.submittedAt ?? undefined,
    versions: (row.versions as Submission["versions"] | null) ?? [],
    canvasUserId: row.canvasUserId ?? undefined,
    canvasSyncedAt: row.canvasSyncedAt?.toISOString() ?? undefined,
    canvasSyncError: row.canvasSyncError ?? undefined,
  };
}

function toLessonRecord(row: LessonRecordRow): LessonRecord {
  return {
    lessonId: row.lessonId,
    weekStart: row.weekStart,
    attended: row.attended,
    submitted: row.submitted,
    score: row.score,
    dataMissing: row.dataMissing,
  };
}

/** 課題を1件取得する */
export async function getAssignment(id: string): Promise<Assignment | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, id))
    .limit(1);
  return row;
}

/** 受講生の提出を課題スコープで取得する */
export async function findSubmission(
  assignmentId: string,
  studentId: string,
): Promise<Submission | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(submissionsTable)
    .where(
      and(
        eq(submissionsTable.assignmentId, assignmentId),
        eq(submissionsTable.studentId, studentId),
      ),
    )
    .limit(1);
  return row ? toSubmission(row) : undefined;
}

/** 提出をIDのみで取得する（講師の採点画面・AI採点タスク用） */
export async function getSubmissionById(id: string): Promise<Submission | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(submissionsTable)
    .where(eq(submissionsTable.id, id))
    .limit(1);
  return row ? toSubmission(row) : undefined;
}

/**
 * 読取り時の状態を条件にした更新（楽観ロック）。
 *
 * 読んだときの **版数と状態の両方**が現在の行と一致する場合のみ書き込み、
 * 不一致（＝別リクエストが先に更新済み）なら null を返す。
 * DB側のWHERE条件で不可分に判定するため、旧実装が依存していた
 * 「同一プロセス内でawaitを挟まない」という前提は不要（既知残課題#1）。
 *
 * **状態も条件に含める理由**は下の `.where` のコメントを参照。版数だけでは
 * 初回提出の同時実行を止められなかった（2026-09-02の回帰）。
 *
 * @param expectedStatus 呼び出し側が **読んだ時点の** status（`next.status` ではない）
 */
export async function updateSubmissionIfVersion(
  next: Submission,
  expectedVersion: number,
  expectedStatus: Submission["status"],
): Promise<Submission | null> {
  const db = getDb();
  const [row] = await db
    .update(submissionsTable)
    .set({
      status: next.status,
      version: next.version,
      promptText: next.promptText,
      aiOutputText: next.aiOutputText,
      reflectionText: next.reflectionText,
      isLate: next.isLate,
      aiGrade: next.aiGrade ?? null,
      teacherScore: next.teacherScore ?? null,
      hasDeviation: next.hasDeviation,
      teacherComment: next.teacherComment ?? null,
      submittedAt: next.submittedAt ?? null,
      versions: next.versions,
      canvasUserId: next.canvasUserId ?? null,
    })
    .where(
      and(
        eq(submissionsTable.id, next.id),
        eq(submissionsTable.version, expectedVersion),
        // **版数だけでは足りない**（2026-09-02 の回帰）。`submit()` は再提出のときしか
        // versionを増やさないため、初回提出では version が据え置きのまま書き戻され、
        // 行の値が変わらず後続の同時リクエストが全部マッチしてしまう。
        // 読んだ時点の status も条件に含めることで、状態遷移を伴う更新は必ず
        // 「読んだ行」に対してだけ成立する（e2e/regression/2026-09-02-...）。
        eq(submissionsTable.status, expectedStatus),
      ),
    )
    .returning();
  return row ? toSubmission(row) : null;
}

/**
 * Canvas成績表への反映結果を記録する（F3①）。
 * 版数は進めない（採点の状態遷移とは別軸の付帯情報のため、楽観ロックの対象外）。
 * 成功なら syncedAt を入れて error を消し、失敗なら逆にする。
 */
export async function recordCanvasSync(
  submissionId: string,
  result: { syncedAt: Date } | { error: string },
): Promise<void> {
  const db = getDb();
  await db
    .update(submissionsTable)
    .set(
      "syncedAt" in result
        ? { canvasSyncedAt: result.syncedAt, canvasSyncError: null }
        : { canvasSyncedAt: null, canvasSyncError: result.error },
    )
    .where(eq(submissionsTable.id, submissionId));
}

/** S1受講生ホーム用: 未完了の提出と、その課題をまとめて取得する */
export async function listActiveSubmissionsForStudent(
  studentId: string,
): Promise<Array<{ submission: Submission; assignment: Assignment | undefined }>> {
  const db = getDb();
  const submissionRows = await db
    .select()
    .from(submissionsTable)
    .where(eq(submissionsTable.studentId, studentId));
  const active = submissionRows.filter((r) => r.status !== "completed");
  if (active.length === 0) return [];

  const assignmentIds = [...new Set(active.map((r) => r.assignmentId))];
  const assignmentRows = await db
    .select()
    .from(assignmentsTable)
    .where(inArray(assignmentsTable.id, assignmentIds));
  const byId = new Map(assignmentRows.map((a) => [a.id, a]));

  return active.map((row) => ({
    submission: toSubmission(row),
    assignment: byId.get(row.assignmentId),
  }));
}

/** S7採点・差戻し用: 採点待ち（提出済・AI採点済）の提出と課題をまとめて取得する */
export async function listSubmissionsPendingReview(): Promise<
  Array<{ submission: Submission; assignment: Assignment | undefined }>
> {
  const db = getDb();
  const rows = await db
    .select()
    .from(submissionsTable)
    .where(inArray(submissionsTable.status, ["submitted", "ai_graded"]));
  if (rows.length === 0) return [];

  const assignmentIds = [...new Set(rows.map((r) => r.assignmentId))];
  const assignmentRows = await db
    .select()
    .from(assignmentsTable)
    .where(inArray(assignmentsTable.id, assignmentIds));
  const byId = new Map(assignmentRows.map((a) => [a.id, a]));

  return rows.map((row) => ({
    submission: toSubmission(row),
    assignment: byId.get(row.assignmentId),
  }));
}

/**
 * Canvas成績表への反映に失敗したまま残っている提出（F3①）。
 * 講師が見落とさないようS7に一覧表示する。
 */
export async function listCanvasSyncFailures(): Promise<
  Array<{ submission: Submission; assignment: Assignment | undefined }>
> {
  const db = getDb();
  const rows = await db
    .select()
    .from(submissionsTable)
    .where(isNotNull(submissionsTable.canvasSyncError));
  if (rows.length === 0) return [];

  const assignmentIds = [...new Set(rows.map((r) => r.assignmentId))];
  const assignmentRows = await db
    .select()
    .from(assignmentsTable)
    .where(inArray(assignmentsTable.id, assignmentIds));
  const byId = new Map(assignmentRows.map((a) => [a.id, a]));

  return rows.map((row) => ({
    submission: toSubmission(row),
    assignment: byId.get(row.assignmentId),
  }));
}

/** 受講生の学習記録（到達度の入力）を取得する */
export async function getLessonRecords(studentId: string): Promise<LessonRecord[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(lessonRecordsTable)
    .where(eq(lessonRecordsTable.studentId, studentId))
    .orderBy(lessonRecordsTable.weekStart);
  return rows.map(toLessonRecord);
}

/**
 * 全受講生の学習記録を一括取得する（F4: 週次レポートのバッチ生成）。
 * 受講生ごとに1クエリ投げないための一括版。週順に整列して返す。
 */
export async function getAllLessonRecords(): Promise<Map<string, LessonRecord[]>> {
  const db = getDb();
  const rows = await db
    .select()
    .from(lessonRecordsTable)
    .orderBy(lessonRecordsTable.studentId, lessonRecordsTable.weekStart);

  const byStudent = new Map<string, LessonRecord[]>();
  for (const row of rows) {
    const list = byStudent.get(row.studentId) ?? [];
    list.push(toLessonRecord(row));
    byStudent.set(row.studentId, list);
  }
  return byStudent;
}

/**
 * 受講生ごとの未提出（完了していない）課題名を一括取得する
 * （F4: 週次レポートの「未提出課題一覧」）。
 */
export async function getPendingAssignmentsByStudent(): Promise<Map<string, string[]>> {
  const db = getDb();
  const rows = await db
    .select({
      studentId: submissionsTable.studentId,
      title: assignmentsTable.title,
    })
    .from(submissionsTable)
    .innerJoin(assignmentsTable, eq(submissionsTable.assignmentId, assignmentsTable.id))
    .where(ne(submissionsTable.status, "completed"))
    .orderBy(submissionsTable.studentId, assignmentsTable.title);

  const byStudent = new Map<string, string[]>();
  for (const row of rows) {
    const list = byStudent.get(row.studentId) ?? [];
    list.push(row.title);
    byStudent.set(row.studentId, list);
  }
  return byStudent;
}

/** 1席のデバイス割当（存在しない座席は undefined） */
export async function getDeviceAssignment(seatNo: number): Promise<DeviceAssignment | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(deviceAssignmentsTable)
    .where(eq(deviceAssignmentsTable.seatNo, seatNo))
    .limit(1);
  return row;
}

/** 全席のデバイス割当（座席番号順） */
export async function getDeviceAssignments(): Promise<DeviceAssignment[]> {
  const db = getDb();
  return db.select().from(deviceAssignmentsTable).orderBy(deviceAssignmentsTable.seatNo);
}

/**
 * 座席に座る受講生を変更する（`null` で空席にする）。存在しない座席は undefined。
 *
 * **同じ受講生を2席に置かない** — 割り当てる前に、その受講生が座っていた席を
 * 空席に戻す。DB側にも一意制約があるが（0008）、制約違反で失敗させるのではなく
 * 「席を移した」という講師の意図どおりに動かすため、ここで先に外す。
 *
 * 変更前の値を返すので、呼び出し側が監査ログに残せる。
 */
export async function setDeviceStudent(
  seatNo: number,
  studentId: string | null,
): Promise<{ before: string | null; row: DeviceAssignment } | undefined> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(deviceAssignmentsTable)
      .where(eq(deviceAssignmentsTable.seatNo, seatNo))
      .limit(1);
    if (!current) return undefined;

    if (studentId !== null) {
      await tx
        .update(deviceAssignmentsTable)
        .set({ studentId: null })
        .where(eq(deviceAssignmentsTable.studentId, studentId));
    }

    const [row] = await tx
      .update(deviceAssignmentsTable)
      .set({ studentId })
      .where(eq(deviceAssignmentsTable.seatNo, seatNo))
      .returning();
    return { before: current.studentId, row };
  });
}

/** 予備機への切替状態を変更する。存在しない座席は undefined */
export async function setDeviceBackup(
  seatNo: number,
  usingBackup: boolean,
): Promise<DeviceAssignment | undefined> {
  const db = getDb();
  const [row] = await db
    .update(deviceAssignmentsTable)
    .set({ usingBackup })
    .where(eq(deviceAssignmentsTable.seatNo, seatNo))
    .returning();
  return row;
}

/**
 * 出席を記録する（未決#11: 出席はカスタム層で管理）。
 * 指定週の学習記録が無ければ作成する。変更前の値（true/false/未記録）を返す。
 */
export async function setAttendance(
  studentId: string,
  weekStart: string,
  attended: boolean,
): Promise<{ before: boolean | "none"; changed: boolean }> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(lessonRecordsTable)
      .where(
        and(eq(lessonRecordsTable.studentId, studentId), eq(lessonRecordsTable.weekStart, weekStart)),
      )
      .limit(1);

    if (!existing) {
      await tx.insert(lessonRecordsTable).values({
        studentId,
        lessonId: `w-${weekStart}`,
        weekStart,
        attended,
        submitted: false,
        score: null,
        dataMissing: false,
      });
      return { before: "none" as const, changed: true };
    }

    const before = existing.attended;
    if (before === attended && !existing.dataMissing) {
      return { before, changed: false };
    }

    // 出席を記録したら「計測不能」フラグは解除する
    await tx
      .update(lessonRecordsTable)
      .set({ attended, dataMissing: false })
      .where(
        and(eq(lessonRecordsTable.studentId, studentId), eq(lessonRecordsTable.weekStart, weekStart)),
      );
    return { before, changed: true };
  });
}

/** 指定週の出席状態（記録が無ければ undefined） */
export async function getAttendance(
  studentId: string,
  weekStart: string,
): Promise<boolean | undefined> {
  const db = getDb();
  const [row] = await db
    .select({ attended: lessonRecordsTable.attended })
    .from(lessonRecordsTable)
    .where(
      and(eq(lessonRecordsTable.studentId, studentId), eq(lessonRecordsTable.weekStart, weekStart)),
    )
    .limit(1);
  return row?.attended;
}

/**
 * 退会者の学習データ（提出・学習記録）を削除する（Pマーク保持期限。要件定義書5.3）。
 * 破壊的操作。呼び出し側で保持期限の判定・管理者権限確認・監査記録を必ず行うこと。
 * 削除件数を返す（監査の変更前スナップショット用）。再実行しても安全（冪等）。
 */
export async function purgeStudentData(studentId: string): Promise<{
  deletedSubmissions: number;
  hadLessonRecords: boolean;
  deletedExternalMastery: number;
  deletedChatLogs: number;
  deletedTeacherMessages: number;
  removedFromRoster: boolean;
  releasedSeats: number;
}> {
  const db = getDb();
  const deletedSubmissions = await db
    .delete(submissionsTable)
    .where(eq(submissionsTable.studentId, studentId))
    .returning({ id: submissionsTable.id });
  const deletedLessonRecords = await db
    .delete(lessonRecordsTable)
    .where(eq(lessonRecordsTable.studentId, studentId))
    .returning({ weekStart: lessonRecordsTable.weekStart });
  // eラーニングから受け取った自宅学習の到達度も消す（E7-c）。
  // ここに足し忘れると、退会者のデータが1テーブルだけ残る
  const deletedExternalMastery = await db
    .delete(externalMasteryTable)
    .where(eq(externalMasteryTable.studentId, studentId))
    .returning({ unitId: externalMasteryTable.unitId });
  // AI講師の会話ログと、講師からの一言も消す（2026-09-02追加）。
  // **テーブルを増やしたらこの関数に足す** — 足し忘れると退会者のデータが残る
  const deletedChatLogs = await db
    .delete(chatLogsTable)
    .where(eq(chatLogsTable.studentId, studentId))
    .returning({ id: chatLogsTable.id });
  const deletedTeacherMessages = await db
    .delete(teacherMessagesTable)
    .where(eq(teacherMessagesTable.studentId, studentId))
    .returning({ id: teacherMessagesTable.id });
  // 座席の割当も外す（行は消さない — 座席とNUCは備品であって個人データではない）。
  // 残すと退会者のIDが割当表に残り続け、その席を他の人に割り当てられない
  const releasedSeats = await db
    .update(deviceAssignmentsTable)
    .set({ studentId: null })
    .where(eq(deviceAssignmentsTable.studentId, studentId))
    .returning({ seatNo: deviceAssignmentsTable.seatNo });
  // 名簿からも消す（残すと退会者がS6のタイルに並び続ける）
  const removedFromRoster = await db
    .delete(studentsTable)
    .where(eq(studentsTable.id, studentId))
    .returning({ id: studentsTable.id });
  return {
    deletedSubmissions: deletedSubmissions.length,
    hadLessonRecords: deletedLessonRecords.length > 0,
    deletedExternalMastery: deletedExternalMastery.length,
    deletedChatLogs: deletedChatLogs.length,
    deletedTeacherMessages: deletedTeacherMessages.length,
    removedFromRoster: removedFromRoster.length > 0,
    releasedSeats: releasedSeats.length,
  };
}

/**
 * 講師の成績確定を最新の授業コマ記録へ反映する（F3→F4連携）。
 * 記録がない受講生（学習記録の収集前）は何もしない。
 */
export async function recordCompletionScore(studentId: string, score: number): Promise<void> {
  const db = getDb();
  const [latest] = await db
    .select({ weekStart: lessonRecordsTable.weekStart })
    .from(lessonRecordsTable)
    .where(eq(lessonRecordsTable.studentId, studentId))
    .orderBy(desc(lessonRecordsTable.weekStart))
    .limit(1);
  if (!latest) return;
  await db
    .update(lessonRecordsTable)
    .set({ submitted: true, score })
    .where(
      and(
        eq(lessonRecordsTable.studentId, studentId),
        eq(lessonRecordsTable.weekStart, latest.weekStart),
      ),
    );
}

/** E2E・開発用: DBを初期状態に戻す（管理ロールでの全削除＋再シード） */
export async function resetStore(): Promise<void> {
  await resetDatabase();
  globalThis.__storeResetEpoch = getResetEpoch() + 1;
}
