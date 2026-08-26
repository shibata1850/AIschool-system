import { getAdminDb } from "@/lib/db/adminClient";
import { getDb } from "@/lib/db/client";
import { auditLog as auditLogTable } from "@/lib/db/schema";

/**
 * 監査ログ（CLAUDE.md 9章・要件定義書5.2 — 2026-07-03 監査指摘#8の修正）。
 * データの作成・更新・削除を「操作者・日時・変更前後」で記録する。
 *
 * PostgreSQLの追記専用テーブル。実行時アプリのDBロール（aischool_app）には
 * UPDATE/DELETE権限を与えていない（drizzle/migrations/0001_grant_app_role.sql）ため、
 * このモジュール経由でも既存エントリの改変はできない。
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

/** 追記のみ。既存エントリの変更・削除APIは提供しない */
export async function recordAudit(entry: Omit<AuditEntry, "at">): Promise<void> {
  const db = getDb();
  await db.insert(auditLogTable).values({
    at: new Date(),
    actorRole: entry.actorRole,
    actorId: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}

/** 閲覧は管理者のみ（呼び出し側でロールを検証すること）。記録順（古い順）で返す */
export async function getAuditLog(): Promise<AuditEntry[]> {
  const db = getDb();
  const rows = await db.select().from(auditLogTable).orderBy(auditLogTable.id);
  return rows.map((row) => ({
    at: row.at.toISOString(),
    actorRole: row.actorRole,
    actorId: row.actorId ?? undefined,
    action: row.action as AuditEntry["action"],
    entity: row.entity,
    entityId: row.entityId,
    before: row.before ?? undefined,
    after: row.after ?? undefined,
  }));
}

/** E2E・開発用: 監査ログを全削除する（管理ロール — アプリロールにはDELETE権限が無い） */
export async function clearAuditLog(): Promise<void> {
  const db = getAdminDb();
  await db.delete(auditLogTable);
}
