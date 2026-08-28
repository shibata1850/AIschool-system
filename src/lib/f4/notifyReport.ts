import { createCanvasClient, type CanvasClient } from "@/lib/canvas/client";
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
): Promise<NotifyResult> {
  if (!client) {
    return { state: "skipped", reason: "Canvas未接続（CANVAS_BASE_URL/CANVAS_API_TOKEN 未設定）" };
  }

  try {
    const courses = await client.listCourses();
    if (courses.length === 0) {
      return { state: "skipped", reason: "通知対象のコースがありません" };
    }

    // 全コースの講師・TAを宛先にする（同一人物の重複はIDで除く）
    const recipientIds = new Set<number>();
    for (const course of courses) {
      for (const teacher of await client.listTeachers(course.id)) {
        recipientIds.add(teacher.id);
      }
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
    // 応答本文は個人情報を含み得るため、メッセージのみ記録する
    return {
      state: "error",
      reason: error instanceof Error ? error.message : "通知の送信に失敗しました",
    };
  }
}
