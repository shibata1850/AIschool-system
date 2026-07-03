import { NextResponse } from "next/server";
import { clearAuditLog } from "@/lib/audit/log";
import { resetStore } from "@/lib/f3/store";

/** E2E・開発用: ストア・監査ログを初期状態に戻す（本番デプロイでは無効化する） */
export async function POST() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_RESET !== "1") {
    return new NextResponse("無効なエンドポイントです", { status: 404 });
  }
  resetStore();
  clearAuditLog();
  return NextResponse.json({ ok: true });
}
