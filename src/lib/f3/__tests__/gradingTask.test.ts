import { beforeEach, describe, expect, it } from "vitest";
import type { Grader } from "../grading";
import { runAiGrading } from "../gradingTask";
import { getStore, resetStore } from "../store";
import type { Submission } from "../types";

const grader: Grader = {
  async grade() {
    return {
      totalScore: 70,
      feedback: "よくできました。次は形式も指定しよう",
      rationale: "テスト用",
      model: "test",
      promptVersion: "grading-v1",
    };
  },
};

function seedSubmitted(version: number): void {
  const store = getStore();
  const base = store.submissions.get("s1")!;
  const submitted: Submission = {
    ...base,
    status: "submitted",
    version,
    promptText: `第${version}版の提出`,
    submittedAt: "2026-10-20T10:00:00+09:00",
  };
  store.submissions.set("s1", submitted);
}

describe("runAiGrading（2026-07-03 夜間レビュー指摘#1・#5の回帰）", () => {
  beforeEach(() => resetStore());

  it("正常系: 提出済＋版数一致なら採点結果を適用する", async () => {
    seedSubmitted(1);
    const assignment = getStore().assignments.get("a1")!;
    await runAiGrading("s1", 1, assignment, grader);
    const after = getStore().submissions.get("s1")!;
    expect(after.status).toBe("ai_graded");
    expect(after.aiGrade?.totalScore).toBe(70);
  });

  it("版数が進んでいたら旧版の採点結果を捨てる（差戻し→再提出の競合）", async () => {
    seedSubmitted(2); // 採点タスクは第1版を想定して起動された
    const assignment = getStore().assignments.get("a1")!;
    await runAiGrading("s1", 1, assignment, grader);
    const after = getStore().submissions.get("s1")!;
    expect(after.status).toBe("submitted"); // 第2版は未採点のまま（第2版のタスクが処理する）
    expect(after.aiGrade).toBeUndefined();
  });

  it("採点中にストアが初期化されたら結果を破棄する", async () => {
    seedSubmitted(1);
    const assignment = getStore().assignments.get("a1")!;
    const slowGrader: Grader = {
      async grade(a, text) {
        resetStore(); // 採点中にE2Eリセット等が走った状況を再現
        return grader.grade(a, text);
      },
    };
    await runAiGrading("s1", 1, assignment, slowGrader);
    const after = getStore().submissions.get("s1")!;
    expect(after.status).toBe("not_started"); // 初期化後のシード状態のまま
  });
});
