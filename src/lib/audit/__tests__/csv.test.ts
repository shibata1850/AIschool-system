import { describe, expect, it } from "vitest";
import { auditToCsv } from "../csv";
import type { AuditEntry } from "../log";

describe("auditToCsv", () => {
  it("ヘッダー＋行を出力する", () => {
    const entries: AuditEntry[] = [
      {
        at: "2026-10-19T10:00:00.000Z",
        actorRole: "teacher",
        actorId: "u-1",
        action: "update",
        entity: "submission",
        entityId: "s1",
        before: { status: "submitted" },
        after: { status: "completed", teacherScore: 90 },
      },
    ];
    const csv = auditToCsv(entries);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("日時,操作者ロール,操作者ID,操作,対象,対象ID,変更前,変更後");
    expect(lines[1]).toContain("teacher");
    expect(lines[1]).toContain("u-1");
    expect(lines[1]).toContain("completed");
  });

  it("カンマ・引用符・改行を含む値をエスケープする", () => {
    const entries: AuditEntry[] = [
      {
        at: "2026-10-19T10:00:00.000Z",
        actorRole: "admin",
        action: "create",
        entity: "note",
        entityId: 'a,b"c\nd',
      },
    ];
    const line = auditToCsv(entries).split("\r\n")[1];
    // 対象IDフィールドは引用符で囲まれ、内部の " は "" になる
    expect(line).toContain('"a,b""c\nd"');
  });

  it("actorId/before/after が無い場合は空欄", () => {
    const entries: AuditEntry[] = [
      { at: "t", actorRole: "system", action: "update", entity: "x", entityId: "y" },
    ];
    const line = auditToCsv(entries).split("\r\n")[1];
    expect(line).toBe("t,system,,update,x,y,,");
  });
});
