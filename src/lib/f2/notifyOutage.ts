import { createCanvasClient, type CanvasClient } from "@/lib/canvas/client";
import type { NotifyResult } from "@/lib/f4/notifyReport";
import { recordOutageNotification, staticMaterial } from "./outage";

/**
 * AI講師の停止を講師へ通知する（受け入れ基準 F2②「講師通知」）。
 * 週次レポートの通知（notifyReport.ts）と同じ経路（Canvasメッセージ）・同じ方針:
 * 例外は投げず結果を返し、通知の失敗で受講生の応答を止めない。
 *
 * 本文に受講生の情報は載せない（停止の事実と案内内容だけ）。
 */

function formatJst(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 講師へ送る本文（画面にも同じ趣旨を出す。文言は画面仕様書S3/S6と揃える） */
export function buildOutageNotificationBody(since: string, monitorUrl?: string): string {
  const material = staticMaterial();
  const lines = [
    `AI講師（Claude API）が ${formatJst(since)} から応答できなくなっています。`,
    "",
    "受講生の画面には、次の案内が自動で出ています:",
    "・AI講師は今、一時的に使えません",
    material
      ? `・教材「${material.title}」を開いて、先に進めておいてください`
      : "・分からないことは講師に聞いてください",
  ];
  if (material) lines.push("・分からないことは講師に聞いてください");
  lines.push(
    "",
    "復旧すると自動で元に戻ります（1分ごとに再試行しています）。",
    "受講生には口頭で「教材で先に進めてください」と伝えてください。",
  );
  if (monitorUrl) lines.push("", `状況: ${monitorUrl}`);
  return lines.join("\n");
}

function monitorUrl(): string | undefined {
  const base = process.env.LTI_TOOL_URL?.replace(/\/+$/, "");
  return base ? `${base}/teacher/monitor` : undefined;
}

export async function notifyAiOutage(
  since: string,
  client: CanvasClient | null = createCanvasClient(),
): Promise<NotifyResult> {
  const result = await send(since, client);
  try {
    await recordOutageNotification(
      result.state === "sent" ? { state: "sent" } : { state: result.state, reason: result.reason },
    );
  } catch (error) {
    console.error("停止通知の記録に失敗しました:", error instanceof Error ? error.message : error);
  }
  return result;
}

async function send(since: string, client: CanvasClient | null): Promise<NotifyResult> {
  if (!client) {
    return { state: "skipped", reason: "Canvas未接続（CANVAS_BASE_URL/CANVAS_API_TOKEN 未設定）" };
  }
  try {
    const courses = await client.listCourses();
    if (courses.length === 0) {
      return { state: "skipped", reason: "通知対象のコースがありません" };
    }
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
      "【AI講師 停止】受講生の画面は教材への案内に切り替わっています",
      buildOutageNotificationBody(since, monitorUrl()),
    );
    return { state: "sent", recipientCount: recipientIds.size };
  } catch (error) {
    return {
      state: "error",
      reason: error instanceof Error ? error.message : "通知の送信に失敗しました",
    };
  }
}
