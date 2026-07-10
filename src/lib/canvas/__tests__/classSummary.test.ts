import { describe, expect, it } from "vitest";
import { CanvasApiError, type CanvasClient } from "../client";
import { resolveClassSummary } from "../classSummary";

function stubClient(overrides: Partial<CanvasClient>): CanvasClient {
  return overrides as CanvasClient;
}

describe("resolveClassSummary", () => {
  it("未設定・コースなし・公開課題なしをそれぞれ返す", async () => {
    expect((await resolveClassSummary(null)).state).toBe("notConfigured");
    expect(
      (await resolveClassSummary(stubClient({ listCourses: async () => [] }))).state,
    ).toBe("empty");
    const noAssign = stubClient({
      listCourses: async () => [{ id: 1, name: "c" }],
      listStudents: async () => [],
      listAssignments: async () => [
        { id: 1, name: "下書き", description: null, points_possible: null, due_at: null, published: false },
      ],
    });
    expect((await resolveClassSummary(noAssign)).state).toBe("noAssignment");
  });

  it("複数課題を横断して提出数・採点数・平均点を集計する", async () => {
    const client = stubClient({
      listCourses: async () => [{ id: 1, name: "デモコース" }],
      listStudents: async () => [
        { id: 11, name: "デモ生徒01" },
        { id: 12, name: "デモ生徒02" },
      ],
      listAssignments: async () => [
        { id: 91, name: "課題A", description: null, points_possible: 100, due_at: null, published: true },
        { id: 92, name: "課題B", description: null, points_possible: 100, due_at: null, published: true },
      ],
      listSubmissions: async (_courseId: number, assignmentId: number) => {
        if (assignmentId === 91) {
          return [
            { id: 1, user_id: 11, workflow_state: "graded", score: 80, submitted_at: "2026-10-01T00:00:00Z", late: false },
            { id: 2, user_id: 12, workflow_state: "graded", score: 60, submitted_at: "2026-10-01T00:00:00Z", late: false },
          ];
        }
        // 課題B: 生徒01のみ採点済み（提出はなし＝管理者採点）、生徒02は未提出
        return [
          { id: 3, user_id: 11, workflow_state: "graded", score: 90, submitted_at: null, late: false },
        ];
      },
    });
    const summary = await resolveClassSummary(client);
    expect(summary.state).toBe("ok");
    if (summary.state === "ok") {
      expect(summary.totalAssignments).toBe(2);
      const s1 = summary.rows.find((r) => r.student.id === 11)!;
      const s2 = summary.rows.find((r) => r.student.id === 12)!;
      // 生徒01: 提出1（課題A）、採点2（80,90）→平均85
      expect(s1.submittedCount).toBe(1);
      expect(s1.gradedCount).toBe(2);
      expect(s1.averageScore).toBe(85);
      // 生徒02: 提出1（課題A）、採点1（60）→平均60
      expect(s2.submittedCount).toBe(1);
      expect(s2.gradedCount).toBe(1);
      expect(s2.averageScore).toBe(60);
    }
  });

  it("採点が1件もない受講生は平均点null", async () => {
    const client = stubClient({
      listCourses: async () => [{ id: 1, name: "c" }],
      listStudents: async () => [{ id: 11, name: "デモ生徒01" }],
      listAssignments: async () => [
        { id: 91, name: "課題A", description: null, points_possible: 100, due_at: null, published: true },
      ],
      listSubmissions: async () => [],
    });
    const summary = await resolveClassSummary(client);
    if (summary.state === "ok") {
      expect(summary.rows[0].averageScore).toBeNull();
      expect(summary.rows[0].gradedCount).toBe(0);
    }
  });

  it("APIエラーは状態errorにして本文を漏らさない", async () => {
    const client = stubClient({
      listCourses: async () => {
        throw new CanvasApiError(500, "秘匿本文");
      },
    });
    const summary = await resolveClassSummary(client);
    expect(summary.state).toBe("error");
    if (summary.state === "error") {
      expect(summary.message).not.toContain("秘匿");
    }
  });
});
