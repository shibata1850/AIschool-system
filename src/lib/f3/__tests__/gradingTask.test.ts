import { beforeEach, describe, expect, it } from "vitest";
import type { Grader } from "../grading";
import { runAiGrading } from "../gradingTask";
import { findSubmission, getAssignment, resetStore, updateSubmissionIfVersion } from "../store";
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

/** 最小シードの s1（a1/student-demo）を指定版数の「提出済」に書き換える */
async function seedSubmitted(version: number): Promise<void> {
  const base = await findSubmission("a1", "student-demo");
  if (!base) throw new Error("seed submission not found");
  const submitted: Submission = {
    ...base,
    status: "submitted",
    version,
    promptText: `第${version}版の提出`,
    submittedAt: "2026-10-20T10:00:00+09:00",
  };
  const updated = await updateSubmissionIfVersion(submitted, base.version);
  if (!updated) throw new Error("seedSubmitted: 版数不一致で失敗しました");
}

describe("runAiGrading（2026-07-03 夜間レビュー指摘#1・#5の回帰）", () => {
  beforeEach(async () => {
    await resetStore();
  });

  it("正常系: 提出済＋版数一致なら採点結果を適用する", async () => {
    await seedSubmitted(1);
    const assignment = (await getAssignment("a1"))!;
    await runAiGrading("s1", 1, assignment, grader);
    const after = await findSubmission("a1", "student-demo");
    expect(after?.status).toBe("ai_graded");
    expect(after?.aiGrade?.totalScore).toBe(70);
  });

  it("版数が進んでいたら旧版の採点結果を捨てる（差戻し→再提出の競合）", async () => {
    await seedSubmitted(2); // 採点タスクは第1版を想定して起動された
    const assignment = (await getAssignment("a1"))!;
    await runAiGrading("s1", 1, assignment, grader);
    const after = await findSubmission("a1", "student-demo");
    expect(after?.status).toBe("submitted"); // 第2版は未採点のまま（第2版のタスクが処理する）
    expect(after?.aiGrade).toBeUndefined();
  });

  it("採点中にストアがリセットされたら結果を破棄する", async () => {
    await seedSubmitted(1);
    const assignment = (await getAssignment("a1"))!;
    const slowGrader: Grader = {
      async grade(a, text) {
        await resetStore(); // 採点中にE2Eリセット等が走った状況を再現
        return grader.grade(a, text);
      },
    };
    await runAiGrading("s1", 1, assignment, slowGrader);
    const after = await findSubmission("a1", "student-demo");
    expect(after?.status).toBe("not_started"); // リセット後のシード状態のまま
  });
});
