import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { deviceAssignments, students } from "@/lib/db/schema";
import { STUDENTS, type StudentProfile } from "@/lib/f4/fixtures";

/**
 * 受講生名簿の供給元（2026-09-02追加）。
 *
 * **解決している問題**: 講師画面（S6など）が架空名簿（`fixtures.ts`）を使う一方、
 * 受講生の画面はLTIの `sub` で自分のデータを引いていた。両者のIDが噛み合わず、
 * 講師が送った「一言」が実受講生に届かない・会話ログが0件に見える、という形で
 * 本番に出た。
 *
 * **なぜCanvas REST APIの名簿ではないか**: Canvasの名簿が返すのはRESTの数値IDで、
 * LTIの `sub` とは別値である。RESTを起点にすると、講師画面と受講生画面が
 * 別人を指したままになる。**LTI起動時に記録した名簿（students）を正とする。**
 *
 * **座席番号**: `device_assignments`（S9で編集できる座席×受講生の割当表）から引く。
 * 割当が無い受講生は座席なし（`seatNo: 0`）として名簿の末尾に置く。
 */

/** 名簿が空のとき（デモ・E2E・LTI起動前）は架空名簿にフォールバックする */
export function isDemoRoster(roster: StudentProfile[]): boolean {
  return roster === STUDENTS;
}

/**
 * 現在の受講生名簿を返す。
 *
 * LTI起動の記録が1件も無ければ架空名簿を返す（デモ・E2E・開校前）。
 * **1件でもあれば実名簿だけを返す** — 架空と実物を混ぜると、講師画面に
 * 存在しない受講生が並ぶ。
 */
export async function getRoster(): Promise<StudentProfile[]> {
  const db = getDb();
  const rows = await db.select().from(students).orderBy(asc(students.id));
  if (rows.length === 0) return STUDENTS;

  const seats = await db.select().from(deviceAssignments);
  const seatOf = new Map(
    seats
      .filter((d): d is typeof d & { studentId: string } => d.studentId !== null)
      .map((d) => [d.studentId, d.seatNo]),
  );

  return rows
    .map((r) => ({
      id: r.id,
      displayName: r.displayName,
      seatNo: seatOf.get(r.id) ?? 0,
    }))
    .sort((a, b) => {
      // 座席あり→座席順、座席なし→末尾（表示名順）
      if (a.seatNo !== b.seatNo) {
        if (a.seatNo === 0) return 1;
        if (b.seatNo === 0) return -1;
        return a.seatNo - b.seatNo;
      }
      return a.displayName.localeCompare(b.displayName, "ja");
    });
}

/** 表示名を引く。名簿に無いIDはIDをそのまま返す（消えた受講生のログ等） */
export async function resolveDisplayName(studentId: string): Promise<string> {
  const roster = await getRoster();
  return roster.find((s) => s.id === studentId)?.displayName ?? studentId;
}

/**
 * LTI起動時に受講生を記録・更新する。
 *
 * **講師・管理者は記録しない** — 名簿は受講生の一覧であり、ここに講師が混ざると
 * S6の16タイルに講師が並ぶ。呼び出し側でロールを判定して渡すこと。
 */
export async function recordStudentLaunch(input: {
  id: string;
  displayName?: string;
  canvasUserId?: number;
}): Promise<void> {
  const db = getDb();
  const now = new Date();
  // 表示名が取れない起動（name クレーム無し）でもIDで一覧に出せるようにする
  const displayName = input.displayName?.trim() || input.id;
  await db
    .insert(students)
    .values({
      id: input.id,
      displayName,
      canvasUserId: input.canvasUserId ?? null,
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: students.id,
      set: {
        displayName,
        // 一度取れた canvas_user_id を、取れない起動で消さない
        ...(input.canvasUserId !== undefined
          ? { canvasUserId: input.canvasUserId }
          : {}),
        lastSeenAt: now,
      },
    });
}

/** 退会者データ削除（F5②）で使う */
export async function purgeStudentFromRoster(studentId: string): Promise<number> {
  const db = getDb();
  const deleted = await db
    .delete(students)
    .where(eq(students.id, studentId))
    .returning({ id: students.id });
  return deleted.length;
}
