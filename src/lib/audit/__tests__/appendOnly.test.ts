import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { recordAudit } from "../log";

/**
 * 監査ログの追記専用性をDBロールで強制していることの検証（テスト計画書 SEC-2）。
 * アプリ実行時ロール（aischool_app）にはUPDATE/DELETE権限を与えていない
 * （drizzle/migrations/0001_grant_app_role.sql）。recordAudit/getAuditLog が使う
 * のと同じ接続（getDb）で直接UPDATE/DELETEを試み、拒否されることを確認する。
 */
describe("監査ログの追記専用性（DBロールでの強制・SEC-2）", () => {
  it("アプリ用DBロールはUPDATEできない", async () => {
    await recordAudit({ actorRole: "system", action: "create", entity: "test", entityId: "sec2-update" });
    const db = getDb();
    const [row] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, "sec2-update"))
      .limit(1);
    expect(row).toBeDefined();

    await expect(
      db.update(auditLog).set({ actorRole: "tampered" }).where(eq(auditLog.id, row.id)),
    ).rejects.toThrow();
  });

  it("アプリ用DBロールはDELETEできない", async () => {
    await recordAudit({ actorRole: "system", action: "create", entity: "test", entityId: "sec2-delete" });
    const db = getDb();
    const [row] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, "sec2-delete"))
      .limit(1);
    expect(row).toBeDefined();

    await expect(db.delete(auditLog).where(eq(auditLog.id, row.id))).rejects.toThrow();
  });
});
