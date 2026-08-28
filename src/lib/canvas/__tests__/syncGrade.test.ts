import { describe, expect, it, vi } from "vitest";
import type { CanvasClient } from "../client";
import { syncGradeToCanvas } from "../syncGrade";
import { readCanvasUserId } from "@/lib/lti/launch";

/** resolveGradebook が期待する最小限の応答を返すスタブ */
function stubClient(over: Partial<Record<string, unknown>> = {}): CanvasClient {
  return {
    listCourses: async () => [{ id: 1, name: "デモコース" }],
    listStudents: async () => [{ id: 501, name: "デモ生徒01" }],
    listAssignments: async () => [{ id: 900, name: "課題A", published: true }],
    listSubmissions: async () => [],
    gradeSubmission: vi.fn(async () => ({})),
    ...over,
  } as unknown as CanvasClient;
}

describe("syncGradeToCanvas（F3① REST方式の成績書き戻し）", () => {
  it("正常系: 名簿にいる受講生の成績をCanvasへ書き込む", async () => {
    const gradeSubmission = vi.fn(async () => ({}));
    const client = stubClient({ gradeSubmission });

    const result = await syncGradeToCanvas(
      { canvasUserId: 501, score: 90, comment: "よくできました" },
      client,
    );

    expect(result).toEqual({ state: "synced" });
    expect(gradeSubmission).toHaveBeenCalledWith(1, 900, 501, 90, "よくできました");
  });

  it("Canvas未接続はスキップ（デモ環境で採点自体は成立させる）", async () => {
    const result = await syncGradeToCanvas({ canvasUserId: 501, score: 90 }, null);
    expect(result.state).toBe("skipped");
    expect(result.state === "skipped" && result.reason).toContain("Canvas未接続");
  });

  it("Canvas利用者IDが不明ならスキップ（LTI起動でない・クレーム未設定）", async () => {
    const result = await syncGradeToCanvas(
      { canvasUserId: undefined, score: 90 },
      stubClient(),
    );
    expect(result.state).toBe("skipped");
    expect(result.state === "skipped" && result.reason).toContain("Canvas利用者ID");
  });

  it("名簿にいない受講生はスキップ（他コースの利用者へ書き込まない）", async () => {
    const gradeSubmission = vi.fn(async () => ({}));
    const result = await syncGradeToCanvas(
      { canvasUserId: 999, score: 90 },
      stubClient({ gradeSubmission }),
    );
    expect(result.state).toBe("skipped");
    expect(result.state === "skipped" && result.reason).toContain("名簿にいません");
    expect(gradeSubmission).not.toHaveBeenCalled();
  });

  it("公開課題が無ければスキップ（書き込み先が決まらない）", async () => {
    const result = await syncGradeToCanvas(
      { canvasUserId: 501, score: 90 },
      stubClient({ listAssignments: async () => [{ id: 900, name: "下書き", published: false }] }),
    );
    expect(result.state).toBe("skipped");
  });

  it("API失敗はerrorとして理由を返す（採点自体は呼び出し側で成立させる）", async () => {
    const result = await syncGradeToCanvas(
      { canvasUserId: 501, score: 90 },
      stubClient({
        gradeSubmission: async () => {
          throw new Error("Canvas APIの呼び出しに失敗しました（HTTP 500）");
        },
      }),
    );
    expect(result.state).toBe("error");
    expect(result.state === "error" && result.reason).toContain("HTTP 500");
  });
});

describe("readCanvasUserId（開発者キーのカスタムフィールド）", () => {
  it("数値・数字文字列のどちらでも読める", () => {
    expect(readCanvasUserId({ canvas_user_id: 501 })).toBe(501);
    expect(readCanvasUserId({ canvas_user_id: "501" })).toBe(501);
  });

  it("未設定・不正値は undefined（成績書き戻しを行わない）", () => {
    expect(readCanvasUserId(undefined)).toBeUndefined();
    expect(readCanvasUserId(null)).toBeUndefined();
    expect(readCanvasUserId({})).toBeUndefined();
    expect(readCanvasUserId({ canvas_user_id: "$Canvas.user.id" })).toBeUndefined();
    expect(readCanvasUserId({ canvas_user_id: 0 })).toBeUndefined();
    expect(readCanvasUserId({ canvas_user_id: -1 })).toBeUndefined();
    expect(readCanvasUserId({ canvas_user_id: 1.5 })).toBeUndefined();
  });
});
