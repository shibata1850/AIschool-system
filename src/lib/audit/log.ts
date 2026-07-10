/**
 * 監査ログ（CLAUDE.md 9章・要件定義書5.2 — 2026-07-03 監査指摘#8の修正）。
 * データの作成・更新・削除を「操作者・日時・変更前後」で記録する。
 *
 * 参照実装はインメモリの追記専用配列。本番はDBの追記専用テーブル
 * （アプリユーザーにUPDATE/DELETE権限なし）に置き換える。
 * 記録内容に氏名等の個人情報を含めない（IDのみ可）。
 */

export interface AuditEntry {
  at: string; // ISO 8601
  actorRole: string;
  /** 操作者のID（LTI起動時はCanvas利用者ID。デモ・Cookie運用時は未記録） */
  actorId?: string;
  action: "create" | "update" | "delete";
  entity: string;
  entityId: string;
  /** 変更前後のスナップショット（JSON化可能な形。作成時beforeなし・削除時afterなし） */
  before?: unknown;
  after?: unknown;
}

declare global {
  var __auditLog: AuditEntry[] | undefined;
}

function entries(): AuditEntry[] {
  if (!globalThis.__auditLog) globalThis.__auditLog = [];
  return globalThis.__auditLog;
}

/** 追記のみ。既存エントリの変更・削除APIは提供しない */
export function recordAudit(entry: Omit<AuditEntry, "at">): void {
  entries().push({ ...entry, at: new Date().toISOString() });
}

/** 閲覧は管理者のみ（呼び出し側でロールを検証すること） */
export function getAuditLog(): readonly AuditEntry[] {
  return entries();
}

/** E2E・開発用 */
export function clearAuditLog(): void {
  globalThis.__auditLog = [];
}
