/** アプリ内のロール（本番はLTI 1.3のロールから写像する — src/lib/lti/roles.ts） */
export type Role = "student" | "teacher" | "admin" | "guest";

/**
 * 現在の受講生IDを返す。
 * 参照実装ではデモ受講生に固定。Canvas/LTI 1.3のログイン実装時は
 * この関数だけを置き換える（各画面・APIへのID散在を防ぐ —
 * 2026-07-03 監査指摘の修正）。
 */
export function getCurrentStudentId(): string {
  return "student-demo";
}
