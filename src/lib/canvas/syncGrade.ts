import { createCanvasClient, type CanvasClient } from "./client";
import { resolveGradebook } from "./gradebook";

/**
 * 講師の確定スコアをCanvas成績表へ反映する（F3①・REST方式）。
 *
 * 方式判断（2026-08-28）: LTI Advantage AGS ではなく、稼働実績のあるREST
 * （B-3と同じ `gradeSubmission`）を使う。AGSは lineitem クレームが要るため
 * 課題としてのLTI起動が前提になり、Canvas側の設定作業が増えるのに対し、
 * RESTは開発者キーへのカスタムフィールド追加1件で足りるため。
 * 経緯と将来の移行余地は docs/要望リスト.md を参照。
 *
 * courseData.ts と同じく例外は投げず状態オブジェクトで返す。呼び出し側は結果を
 * 提出データに記録し、講師が「載ったかどうか」を画面で確認できるようにする。
 */
export type GradeSyncResult =
  | { state: "synced" }
  | { state: "skipped"; reason: string }
  | { state: "error"; reason: string };

export async function syncGradeToCanvas(
  params: {
    /** 提出者のCanvas数値ユーザーID（LTI起動時のカスタムフィールド由来） */
    canvasUserId: number | undefined;
    score: number;
    /** 受講生に見える講評（任意） */
    comment?: string;
  },
  client: CanvasClient | null = createCanvasClient(),
): Promise<GradeSyncResult> {
  if (!client) {
    return { state: "skipped", reason: "Canvas未接続（デモモード）" };
  }
  if (params.canvasUserId === undefined) {
    // LTI起動でない、または開発者キーに canvas_user_id が未設定
    return {
      state: "skipped",
      reason: "提出者のCanvas利用者IDが不明（LTI起動でないか、開発者キーの設定が未了）",
    };
  }

  try {
    const gb = await resolveGradebook(client);
    if (gb.state === "error") {
      // 接続不能・APIエラーは「載せに行って失敗した」＝再実行で解消し得る。
      // 設定不足（コース・課題が無い）とは区別する（前者はerror、後者はskipped）
      return { state: "error", reason: gb.message };
    }
    if (gb.state !== "ok") {
      return {
        state: "skipped",
        reason: "Canvasに採点対象のコース・課題が見つかりません",
      };
    }
    if (!gb.rows.some((r) => r.student.id === params.canvasUserId)) {
      return { state: "skipped", reason: "その受講生はCanvasの名簿にいません" };
    }

    await client.gradeSubmission(
      gb.course.id,
      gb.assignment.id,
      params.canvasUserId,
      params.score,
      params.comment,
    );
    return { state: "synced" };
  } catch (error) {
    // 応答本文は個人情報を含み得るためメッセージのみ
    return {
      state: "error",
      reason: error instanceof Error ? error.message : "Canvasへの反映に失敗しました",
    };
  }
}
