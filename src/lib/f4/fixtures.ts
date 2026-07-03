import type { LessonRecord } from "./achievement";

/**
 * 参照実装用の架空データ（CLAUDE.md 2章: 実個人情報の使用禁止）。
 * 学習記録の実体は src/lib/f3/store.ts が保持する（ここはシード値のみ）。
 * 本番はCanvas REST API（出席・提出・成績）からの収集に置き換える。
 */

export interface StudentProfile {
  id: string;
  /** 表示名（氏名フルネームは使わない — 要件定義書5.3） */
  displayName: string;
  seatNo: number;
}

export const STUDENTS: StudentProfile[] = [
  { id: "student-demo", displayName: "デモ生徒01", seatNo: 1 },
  ...Array.from({ length: 15 }, (_, i) => ({
    id: `s${String(i + 2).padStart(2, "0")}`,
    displayName: `デモ生徒${String(i + 2).padStart(2, "0")}`,
    seatNo: i + 2,
  })),
];

/**
 * 授業コマの学習記録のシード値。
 * - 2026-10-12 の週はシステム障害を想定した「計測不能」コマ（F4例外3）
 * - s02 は最新コマが「出席・未提出」（F4例外4の表示確認用）
 * - s03 は途中入会（最新週のみレコードあり — F4例外1）
 */
export const SEED_LESSON_RECORDS: Record<string, LessonRecord[]> = {
  "student-demo": [
    { lessonId: "l1", weekStart: "2026-10-05", attended: true, submitted: true, score: 80 },
    { lessonId: "l2", weekStart: "2026-10-12", attended: false, submitted: false, score: null, dataMissing: true },
    { lessonId: "l3", weekStart: "2026-10-19", attended: true, submitted: true, score: 74 },
  ],
  s02: [
    { lessonId: "l1", weekStart: "2026-10-05", attended: true, submitted: true, score: 66 },
    { lessonId: "l2", weekStart: "2026-10-12", attended: false, submitted: false, score: null, dataMissing: true },
    { lessonId: "l3", weekStart: "2026-10-19", attended: true, submitted: false, score: null },
  ],
  s03: [
    { lessonId: "l3", weekStart: "2026-10-19", attended: true, submitted: true, score: 88 },
  ],
};

/** 最新コマが「出席・未提出」かどうか（S6のバッジ表示に使用） */
export function isAttendedWithoutSubmission(records: LessonRecord[] | undefined): boolean {
  if (!records || records.length === 0) return false;
  const latest = records[records.length - 1];
  return !latest.dataMissing && latest.attended && !latest.submitted;
}
