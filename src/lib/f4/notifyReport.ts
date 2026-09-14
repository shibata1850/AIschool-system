import { createCanvasClient, type CanvasClient } from "@/lib/canvas/client";
import { toErrorMessage } from "@/lib/canvas/errorMessage";
import { buildNotificationBody, type WeeklyReport } from "./weeklyReport";

/**
 * 週次レポートの通知（要件定義書F4「講師・管理者へCanvasメッセージで通知」）。
 * courseData.ts と同じく例外は投げず状態オブジェクトで返す。
 * 通知の失敗でレポート生成そのものを失敗させないため、呼び出し側は結果を記録するだけでよい。
 */
export type NotifyResult =
  | { state: "sent"; recipientCount: number }
  | { state: "skipped"; reason: string }
  | { state: "error"; reason: string };

/** 画面への導線URL（未設定なら本文にURLを載せない） */
function reportUrl(): string | undefined {
  const base = process.env.LTI_TOOL_URL?.replace(/\/+$/, "");
  return base ? `${base}/teacher/report` : undefined;
}

export async function notifyWeeklyReport(
  report: WeeklyReport,
  client: CanvasClient | null = createCanvasClient(),
  courseId: string | null = null,
): Promise<NotifyResult> {
  if (!courseId?.trim()) {
    return { state: "skipped", reason: "通知対象のコースが指定されていません" };
  }
  if (!client) {
    return { state: "skipped", reason: "Canvas未接続（CANVAS_BASE_URL/CANVAS_API_TOKEN 未設定）" };
  }

  try {
    const course = await client.getCourseByLtiContext(courseId);

    // 起動コースの講師・TAだけを宛先にする（重複はIDで除く）。
    const recipientIds = new Set<number>();
    for (const teacher of await client.listTeachers(course.id)) {
      recipientIds.add(teacher.id);
    }
    if (recipientIds.size === 0) {
      return { state: "skipped", reason: "コースに講師・TAが登録されていません" };
    }

    await client.createConversation(
      [...recipientIds],
      `【週次到達度レポート】${report.weekStart} の週`,
      buildNotificationBody(report, reportUrl()),
    );
    return { state: "sent", recipientCount: recipientIds.size };
  } catch (error) {
    // 例外メッセージ自体にも資格情報や個人情報が含まれ得る。
    return {
      state: "error",
      reason: toErrorMessage(error),
    };
  }
}
