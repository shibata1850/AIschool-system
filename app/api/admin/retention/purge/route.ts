import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
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

  let body: { withdrawals?: unknown; confirm?: unknown };
  try {
    body = await request.json();
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
  }> = [];
  for (const w of expired) {
    const result = purgeStudentData(w.studentId);
    recordAudit({
      actorRole: actor.role,
      actorId: actor.viaLti ? actor.userId : undefined,
      action: "delete",
      entity: "student_data",
      entityId: w.studentId,
      before: { withdrawnAt: w.withdrawnAt, ...result },
    });
    purged.push({ studentId: w.studentId, ...result });
  }

  return NextResponse.json({
    retentionYears: years,
    evaluated: withdrawals.length,
    purgedCount: purged.length,
    purged,
  });
}
