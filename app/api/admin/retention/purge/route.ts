import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getLtiConfig } from "@/lib/lti/config";
import { WeeklyReportBusyError } from "@/lib/db/client";
import { recordAudit } from "@/lib/audit/log";
import { purgeStudentData } from "@/lib/f3/store";
import { retentionYears, selectExpired, type Withdrawal } from "@/lib/retention/policy";

/**
 * 保持期限を過ぎた退会者の学習データを削除する（Pマーク・要件定義書5.3・未決#10）。
 * 管理者のみ（proxy /api/admin）。破壊的操作のため confirm:true を必須にする（CLAUDE.md 2章）。
 * 退会者一覧（studentId・退会日）は校務システム/Canvas由来を想定し、リクエストで受け取る。
 * 削除は監査ログへ記録する（IDと件数のみ・氏名等は含めない — CLAUDE.md 8/9章）。
 */
export async function POST(request: NextRequest) {
  const actor = await getCurrentUser();
  if (actor.role !== "admin") return new NextResponse("管理者権限が必要です", { status: 403 });
  const toolUrl = getLtiConfig()?.toolUrl;
  if (!toolUrl || request.headers.get("origin") !== new URL(toolUrl).origin) {
    return new NextResponse("送信元を確認できません", { status: 403 });
  }

  let body: { withdrawals?: unknown; confirm?: unknown };
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
  } catch {
    return new NextResponse("リクエストの形式が正しくありません", { status: 400 });
  }

  // 破壊的操作の明示確認（誤操作での一括削除を防ぐ）
  if (body.confirm !== true) {
    return new NextResponse("削除を実行するには confirm:true が必要です（破壊的操作）", {
      status: 400,
    });
  }

  if (!Array.isArray(body.withdrawals)) {
    return new NextResponse("withdrawals は配列で指定してください", { status: 400 });
  }

  const withdrawals: Withdrawal[] = [];
  for (const w of body.withdrawals) {
    if (
      typeof w !== "object" ||
      w === null ||
      typeof (w as { studentId?: unknown }).studentId !== "string" ||
      !(w as { studentId: string }).studentId.trim() ||
      typeof (w as { withdrawnAt?: unknown }).withdrawnAt !== "string" ||
      Number.isNaN(new Date((w as { withdrawnAt: string }).withdrawnAt).getTime())
    ) {
      return new NextResponse(
        "withdrawals の各要素は studentId と有効な withdrawnAt（退会日）を持つ必要があります",
        { status: 400 },
      );
    }
    withdrawals.push({
      studentId: (w as Withdrawal).studentId,
      withdrawnAt: (w as Withdrawal).withdrawnAt,
    });
  }

  const years = retentionYears();
  const now = new Date();
  const expired = selectExpired(withdrawals, now, years);

  const purged: Array<{
    studentId: string;
    deletedSubmissions: number;
    hadLessonRecords: boolean;
    // eラーニングから受信した自宅学習の到達度（E7-c）も同時に消える
    deletedExternalMastery: number;
    // AI講師の会話ログと、講師からの一言も消える（2026-09-02）
    deletedChatLogs: number;
    deletedTeacherMessages: number;
    // 名簿からも消す（残すとS6のタイルに退会者が並び続ける）
    removedFromRoster: boolean;
    // 座席の割当も外す（席の行自体は備品として残る）
    releasedSeats: number;
  }> = [];
  let auditedCount = 0;
  for (const w of expired) {
    try {
      const result = await purgeStudentData(w.studentId);
      purged.push({ studentId: w.studentId, ...result });
      await recordAudit({
        actorRole: actor.role,
        actorId: actor.viaLti ? actor.userId : undefined,
        action: "delete",
        entity: "student_data",
        entityId: w.studentId,
        before: { withdrawnAt: w.withdrawnAt, ...result },
      });
      auditedCount++;
    } catch (error) {
      return NextResponse.json({
        message: error instanceof WeeklyReportBusyError
          ? "週次レポートまたは保持期限処理が実行中です。完了済みの処理を確認してください"
          : "処理を中断しました。削除と監査の完了状況を確認してから再実行してください",
        completedCount: purged.length,
        auditedCount,
      }, { status: error instanceof WeeklyReportBusyError ? 503 : 500 });
    }
  }

  return NextResponse.json({
    retentionYears: years,
    evaluated: withdrawals.length,
    purgedCount: purged.length,
    purged,
  });
}
