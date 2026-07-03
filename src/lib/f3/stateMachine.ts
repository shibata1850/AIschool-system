import type { AiGradeResult, Assignment, Submission } from "./types";

/** AI/講師スコアの乖離フラグを立てる差の閾値（F3例外2） */
export const DEVIATION_THRESHOLD = 20;

export class TransitionError extends Error {}

/** 受講生が課題を開始する: 未着手→取組中 */
export function start(submission: Submission): Submission {
  if (submission.status !== "not_started") {
    throw new TransitionError("すでに開始しています");
  }
  return { ...submission, status: "in_progress" };
}

/** 受講生が提出する: 取組中→提出済（文字数・期限を検証） */
export function submit(
  submission: Submission,
  assignment: Assignment,
  input: { promptText: string; aiOutputText?: string; reflectionText?: string },
  now: Date = new Date(),
): Submission {
  if (submission.status !== "in_progress") {
    throw new TransitionError("取組中の課題だけが提出できます");
  }
  const text = input.promptText;
  if (text.trim().length === 0) {
    throw new TransitionError("プロンプト本文を入力してください");
  }
  if (text.length > assignment.charLimit) {
    throw new TransitionError(
      `文字数が上限（${assignment.charLimit}文字）を超えています`,
    );
  }
  const isLate = now.getTime() > new Date(assignment.deadline).getTime();
  const versions =
    submission.submittedAt !== undefined
      ? [
          ...submission.versions,
          {
            version: submission.version,
            promptText: submission.promptText,
            submittedAt: submission.submittedAt,
          },
        ]
      : submission.versions;
  return {
    ...submission,
    status: "submitted",
    version: submission.submittedAt ? submission.version + 1 : submission.version,
    promptText: text,
    aiOutputText: input.aiOutputText ?? "",
    reflectionText: input.reflectionText ?? "",
    isLate,
    submittedAt: now.toISOString(),
    versions,
  };
}

/** システムがAI一次採点を記録する: 提出済→AI採点済 */
export function applyAiGrade(
  submission: Submission,
  grade: AiGradeResult,
): Submission {
  if (submission.status !== "submitted") {
    throw new TransitionError("提出済の課題だけがAI採点できます");
  }
  return { ...submission, status: "ai_graded", aiGrade: grade };
}

/** 講師が確認して完了にする: AI採点済→完了（講師採点が最終・乖離フラグ算出） */
export function complete(
  submission: Submission,
  teacherScore?: number,
): Submission {
  if (submission.status !== "ai_graded") {
    throw new TransitionError("AI採点済の課題だけが完了にできます");
  }
  if (!submission.aiGrade) {
    throw new TransitionError("AI採点結果がありません");
  }
  const finalScore = teacherScore ?? submission.aiGrade.totalScore;
  if (finalScore < 0 || finalScore > 100) {
    throw new TransitionError("スコアは0〜100で入力してください");
  }
  const hasDeviation =
    Math.abs(finalScore - submission.aiGrade.totalScore) >= DEVIATION_THRESHOLD;
  return { ...submission, status: "completed", teacherScore: finalScore, hasDeviation };
}

/** 講師が差戻す: AI採点済→差戻し（コメント必須・最大1,000文字） */
export function returnToStudent(
  submission: Submission,
  comment: string,
): Submission {
  if (submission.status !== "ai_graded") {
    throw new TransitionError("AI採点済の課題だけが差戻しできます");
  }
  if (comment.trim().length === 0) {
    throw new TransitionError("差戻しにはコメントが必要です");
  }
  if (comment.length > 1000) {
    throw new TransitionError("コメントは1,000文字以内で入力してください");
  }
  return { ...submission, status: "returned", teacherComment: comment };
}

/** 受講生が修正を始める: 差戻し→取組中 */
export function resume(submission: Submission): Submission {
  if (submission.status !== "returned") {
    throw new TransitionError("差戻しされた課題だけが修正できます");
  }
  return { ...submission, status: "in_progress" };
}
