import { recordAudit } from "@/lib/audit/log";
import { createGrader, type Grader } from "./grading";
import { applyAiGrade } from "./stateMachine";
import { getStore } from "./store";
import type { Assignment } from "./types";

/**
 * バックグラウンドのAI一次採点タスク。
 * 採点中に差戻し→再提出（版数変化）やストア初期化があった場合は
 * 結果を破棄する（旧版の採点結果を新版に付けない — 2026-07-03 夜間レビュー指摘#1・#5）。
 * 失敗しても提出は失わない（講師の手動採点で処理可能 — F3例外5）。
 */
export async function runAiGrading(
  submissionId: string,
  expectedVersion: number,
  assignment: Assignment,
  grader: Grader = createGrader(),
): Promise<void> {
  const store = getStore();
  try {
    const submitted = store.submissions.get(submissionId);
    if (
      !submitted ||
      submitted.status !== "submitted" ||
      submitted.version !== expectedVersion
    ) {
      return;
    }

    const grade = await grader.grade(assignment, submitted.promptText);

    // ストアが初期化されていたら結果も監査記録も残さない
    if (getStore() !== store) return;
    const fresh = store.submissions.get(submissionId);
    if (
      !fresh ||
      fresh.status !== "submitted" ||
      fresh.version !== expectedVersion
    ) {
      return;
    }

    const next = applyAiGrade(fresh, grade);
    store.submissions.set(next.id, next);
    recordAudit({
      actorRole: "system",
      action: "update",
      entity: "submission",
      entityId: next.id,
      before: { status: fresh.status, version: fresh.version },
      after: { status: next.status, version: next.version, aiScore: grade.totalScore },
    });
  } catch (error) {
    // 提出本文はログしない（個人情報を含み得るため）
    console.error(
      "AI採点に失敗しました（提出は保持されます）:",
      error instanceof Error ? error.message : error,
    );
  }
}
