import { beforeEach, describe, expect, it } from "vitest";
import { clearAuditLog, getAuditLog, recordAudit } from "../log";

describe("監査ログ（CLAUDE.md 9章）", () => {
  beforeEach(() => clearAuditLog());

  it("操作者・日時・変更前後を記録する", () => {
    recordAudit({
      actorRole: "teacher",
      action: "update",
      entity: "submission",
      entityId: "s1",
      before: { status: "ai_graded" },
      after: { status: "completed", teacherScore: 80 },
    });
    const log = getAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0].actorRole).toBe("teacher");
    expect(log[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(log[0].before).toEqual({ status: "ai_graded" });
  });

  it("追記のみで順序が保たれる", () => {
    recordAudit({ actorRole: "student", action: "create", entity: "submission", entityId: "s1" });
    recordAudit({ actorRole: "teacher", action: "update", entity: "submission", entityId: "s1" });
    const log = getAuditLog();
    expect(log.map((e) => e.action)).toEqual(["create", "update"]);
  });
});
