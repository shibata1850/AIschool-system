import { describe, expect, it } from "vitest";
import {
  applyAiGrade,
  complete,
  resume,
  returnToStudent,
  start,
  submit,
  TransitionError,
} from "../stateMachine";
import type { AiGradeResult, Assignment, Submission } from "../types";

const assignment: Assignment = {
  id: "a1",
  title: "テスト課題",
  description: "説明",
  charLimit: 100,
  deadline: "2026-10-13T23:59:00+09:00",
};

const grade: AiGradeResult = {
  totalScore: 70,
  feedback: "よくできました。次は条件を増やしてみよう",
  rationale: "指示が明確",
  model: "mock-v1",
  promptVersion: "grading-v1",
};

function newSubmission(): Submission {
  return {
    id: "s1",
    assignmentId: "a1",
    studentId: "u1",
    status: "not_started",
    version: 1,
    promptText: "",
    aiOutputText: "",
    reflectionText: "",
    isLate: false,
    hasDeviation: false,
    versions: [],
  };
}

const before = new Date("2026-10-13T12:00:00+09:00");
const after = new Date("2026-10-13T23:59:01+09:00");

describe("F3 状態遷移", () => {
  it("正常系: 未着手→取組中→提出済→AI採点済→完了", () => {
    let s = start(newSubmission());
    expect(s.status).toBe("in_progress");
    s = submit(s, assignment, { promptText: "こんにちは" }, before);
    expect(s.status).toBe("submitted");
    expect(s.isLate).toBe(false);
    s = applyAiGrade(s, grade);
    expect(s.status).toBe("ai_graded");
    s = complete(s);
    expect(s.status).toBe("completed");
    expect(s.teacherScore).toBe(70); // 既定はAIスコア
    expect(s.hasDeviation).toBe(false);
  });

  it("差戻し→修正→再提出で版数が上がり履歴が残る", () => {
    let s = start(newSubmission());
    s = submit(s, assignment, { promptText: "1回目" }, before);
    s = applyAiGrade(s, grade);
    s = returnToStudent(s, "条件を3つに増やしてみよう");
    expect(s.status).toBe("returned");
    s = resume(s);
    s = submit(s, assignment, { promptText: "2回目" }, before);
    expect(s.version).toBe(2);
    expect(s.versions).toHaveLength(1);
    expect(s.versions[0].promptText).toBe("1回目");
  });

  it("境界値: 文字数上限ちょうどは提出可、+1文字は不可", () => {
    const s = start(newSubmission());
    const exact = "あ".repeat(assignment.charLimit);
    expect(() => submit({ ...s }, assignment, { promptText: exact }, before)).not.toThrow();
    const over = "あ".repeat(assignment.charLimit + 1);
    expect(() => submit({ ...s }, assignment, { promptText: over }, before)).toThrow(
      /上限/,
    );
  });

  it("境界値: 期限1秒後の提出は遅延フラグが立つ（受付はする）", () => {
    const s = start(newSubmission());
    const late = submit(s, assignment, { promptText: "遅れた提出" }, after);
    expect(late.status).toBe("submitted");
    expect(late.isLate).toBe(true);
  });

  it("境界値: AI/講師スコア差がちょうど20点で乖離フラグON、19点はOFF", () => {
    let s = start(newSubmission());
    s = submit(s, assignment, { promptText: "test" }, before);
    s = applyAiGrade(s, grade); // AI=70
    expect(complete({ ...s }, 90).hasDeviation).toBe(true); // 差20
    expect(complete({ ...s }, 89).hasDeviation).toBe(false); // 差19
    expect(complete({ ...s }, 50).hasDeviation).toBe(true); // 差-20
  });

  it("入力エラー: 空の本文・スコア範囲外・コメントなし差戻しは拒否", () => {
    let s = start(newSubmission());
    expect(() => submit({ ...s }, assignment, { promptText: "  " }, before)).toThrow();
    s = submit(s, assignment, { promptText: "test" }, before);
    s = applyAiGrade(s, grade);
    expect(() => complete({ ...s }, 101)).toThrow(/0〜100/);
    expect(() => returnToStudent({ ...s }, " ")).toThrow(/コメント/);
    expect(() => returnToStudent({ ...s }, "あ".repeat(1001))).toThrow(/1,000/);
  });

  it("不正な遷移は TransitionError", () => {
    const s = newSubmission();
    expect(() => submit(s, assignment, { promptText: "x" }, before)).toThrow(
      TransitionError,
    );
    expect(() => applyAiGrade(s, grade)).toThrow(TransitionError);
    expect(() => complete(s)).toThrow(TransitionError);
    expect(() => resume(s)).toThrow(TransitionError);
  });
});
