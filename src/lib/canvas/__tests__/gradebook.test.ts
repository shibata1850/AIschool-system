import { describe, expect, it } from "vitest";
import { CanvasApiError, type CanvasClient } from "../client";
import { parseScore, resolveGradebook } from "../gradebook";

function stubClient(overrides: Partial<CanvasClient>): CanvasClient {
  return overrides as CanvasClient;
}

describe("parseScore", () => {
  it("0〜100の整数を受け入れる", () => {
    expect(parseScore(0)).toEqual({ ok: true, score: 0 });
    expect(parseScore(100)).toEqual({ ok: true, score: 100 });
    expect(parseScore(73)).toEqual({ ok: true, score: 73 });
  });
  it("範囲外・非整数・非数値を弾く", () => {
    expect(parseScore(-1).ok).toBe(false);
    expect(parseScore(101).ok).toBe(false);
    expect(parseScore(50.5).ok).toBe(false);
    expect(parseScore("80").ok).toBe(false);
    expect(parseScore(NaN).ok).toBe(false);
  });
});

describe("resolveGradebook", () => {
  it("未設定なら notConfigured", async () => {
    expect((await resolveGradebook(null)).state).toBe("notConfigured");
  });
  it("コースなしは empty", async () => {
    expect((await resolveGradebook(stubClient({ listCourses: async () => [] }))).state).toBe(
      "empty",
    );
  });
  it("公開課題がなければ noAssignment", async () => {
    const client = stubClient({
      listCourses: async () => [{ id: 1, name: "コース" }],
      listStudents: async () => [{ id: 11, name: "デモ生徒01" }],
      listAssignments: async () => [
        { id: 1, name: "下書き", description: null, points_possible: null, due_at: null, published: false },
      ],
    });
    expect((await resolveGradebook(client)).state).toBe("noAssignment");
  });
  it("受講生ごとに現在の成績を対応づける（未提出はnull）", async () => {
    const client = stubClient({
      listCourses: async () => [{ id: 1, name: "コース" }],
      listStudents: async () => [
        { id: 11, name: "デモ生徒01" },
        { id: 12, name: "デモ生徒02" },
      ],
      listAssignments: async () => [
        { id: 9, name: "課題", description: null, points_possible: 100, due_at: null, published: true },
      ],
      listSubmissions: async (courseId: number, assignmentId: number) => {
        expect(courseId).toBe(1);
        expect(assignmentId).toBe(9);
        return [
          { id: 100, user_id: 11, workflow_state: "graded", score: 88, submitted_at: "2026-10-19T00:00:00Z", late: false },
        ];
      },
    });
    const gb = await resolveGradebook(client);
    expect(gb.state).toBe("ok");
    if (gb.state === "ok") {
      expect(gb.assignment.id).toBe(9);
      const r1 = gb.rows.find((r) => r.student.id === 11)!;
      const r2 = gb.rows.find((r) => r.student.id === 12)!;
      expect(r1.score).toBe(88);
      expect(r1.workflowState).toBe("graded");
      expect(r2.score).toBeNull();
      expect(r2.workflowState).toBe("unsubmitted");
    }
  });
  it("APIエラーは状態errorにして本文を漏らさない", async () => {
    const client = stubClient({
      listCourses: async () => {
        throw new CanvasApiError(401, "秘匿");
      },
    });
    const gb = await resolveGradebook(client);
    expect(gb.state).toBe("error");
    if (gb.state === "error") {
      expect(gb.message).toContain("トークン");
      expect(gb.message).not.toContain("秘匿");
    }
  });
});
