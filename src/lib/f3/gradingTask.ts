import { recordAudit } from "@/lib/audit/log";
import { createGrader, type Grader } from "./grading";
import { applyAiGrade } from "./stateMachine";
import { getResetEpoch, getSubmissionById, updateSubmissionIfVersion } from "./store";
import type { Assignment } from "./types";

/**
 * バックグラウンドのAI一次採点タスク。
 * 採点中に差戻し→再提出（版数変化）があった場合は結果を破棄する（旧版の採点結果を
 * 新版に付けない — 2026-07-03 夜間レビュー指摘#1・#5）。書込みは版数一致を条件にした
 * 更新（楽観ロック）で行うため、採点処理中に版数が変わった場合はDB側で確実に弾かれる。
 * 加えて、採点中にE2E・開発用リセット（resetStore）が走った場合はDBの版数チェックだけ
 * では検知できない（reset後の行も version=1 からシードされるため）。resetのたびに
 * 増えるプロセス内カウンタ（getResetEpoch）で検知し、結果を破棄する。
 * 失敗しても提出は失わない（講師の手動採点で処理可能 — F3例外5）。
 */
export async function runAiGrading(
  submissionId: string,
  expectedVersion: number,
  assignment: Assignment,
  grader: Grader = createGrader(),
): Promise<void> {
  try {
    const submitted = await getSubmissionById(submissionId);
    if (
      !submitted ||
      submitted.status !== "submitted" ||
      submitted.version !== expectedVersion
    ) {
      return;
    }

    const startEpoch = getResetEpoch();
    const grade = await grader.grade(assignment, submitted.promptText);
    if (getResetEpoch() !== startEpoch) return; // 採点中にリセットが走った

    const next = applyAiGrade(submitted, grade);
    // 読んだ時点の状態は "submitted"（上の early return で確認済み）
    const updated = await updateSubmissionIfVersion(next, expectedVersion, "submitted");
    if (!updated) return; // 版数か状態が変わっていた（差戻し・再提出等）→ 結果を破棄

    await recordAudit({
      actorRole: "system",
      action: "update",
      entity: "submission",
      entityId: updated.id,
      before: { status: submitted.status, version: submitted.version },
      after: { status: updated.status, version: updated.version, aiScore: grade.totalScore },
    });
  } catch (error) {
    // 提出本文はログしない（個人情報を含み得るため）
    console.error(
      "AI採点に失敗しました（提出は保持されます）:",
      error instanceof Error ? error.message : error,
    );
  }
}
