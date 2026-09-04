import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit/log";
import { sendTeacherMessage, TeacherMessageError } from "@/lib/f2/chatLog";
import { getRoster } from "@/lib/roster";

/**
 * 講師から受講生への一言（S6モニタリングの介入導線）。
 * 権限ガードは proxy.ts（`/api/teacher` は講師・管理者のみ）。
 *
 * **なぜ必要か**: プロンプト演習では「この内容をプロンプトに入れてみてください」と
 * テキストそのものを手渡す場面が頻繁にある。口頭では渡せない。
 */
export async function POST(request: NextRequest) {
  let body: { studentId?: unknown; body?: unknown };
  try {
    body = await request.json();
  } catch {
    return new NextResponse("リクエストの形式が正しくありません", { status: 400 });
  }

  if (typeof body.studentId !== "string") {
    return new NextResponse("studentId は文字列で指定してください", { status: 400 });
  }
  if (typeof body.body !== "string") {
    return new NextResponse("body は文字列で指定してください", { status: 400 });
  }
  // 名簿にない宛先へは送らせない（出席記録APIと同じ方針）
  if (!(await getRoster()).some((s) => s.id === body.studentId)) {
    return new NextResponse("その受講生は名簿にありません", { status: 400 });
  }

  const actor = await getCurrentUser();
  try {
    const message = await sendTeacherMessage({
      studentId: body.studentId,
      body: body.body,
      // デモ運用では送信者を特定できないため記録しない（CLAUDE.md 8章）
      sentBy: actor.viaLti ? actor.userId : undefined,
    });

    // 監査ログ（CLAUDE.md 9章）。**本文は残さない** — 宛先と長さのみ。
    // 本文自体は teacher_messages に残っており、二重に持つ意味がない
    await recordAudit({
      actorRole: actor.role,
      actorId: actor.viaLti ? actor.userId : undefined,
      action: "create",
      entity: "teacher_message",
      entityId: String(message.id),
      after: { studentId: message.studentId, length: message.body.length },
    });

    return NextResponse.json({ id: message.id, sentAt: message.sentAt });
  } catch (error) {
    if (error instanceof TeacherMessageError) {
      return new NextResponse(error.message, { status: 400 });
    }
    console.error("メッセージ送信エラー:", error instanceof Error ? error.message : error);
    return new NextResponse(
      "送信できませんでした。もう一度お試しください",
      { status: 500 },
    );
  }
}
