import { NextResponse } from "next/server";
import { verifyIntegrationToken } from "@/lib/integration/auth";
import { listUnitMaster } from "@/lib/integration/mastery";

export const dynamic = "force-dynamic";

/**
 * E7-b: 単元マスタの参照API（eラーニングシステム向け）。
 *
 * 単元マスタの「正」は本リポジトリ側（先方要件定義書2.3）。相手が同じ単元IDを
 * 使えるようにするための読み取り専用エンドポイント。
 *
 * **Canvasの管理者トークンは渡さない**（成績・名簿・個人情報まで触れてしまう）。
 * この連携専用のトークン1本で認証する — docs/eラーニング連携.md 3.2.1。
 *
 * 監査ログには記録しない。返すのは課題の識別子・表示名・締切だけで
 * **個人情報を含まない**ため（CLAUDE.md 9章が記録を求めるのは作成・更新・削除）。
 */
export async function GET(request: Request) {
  const auth = verifyIntegrationToken(request.headers.get("authorization"));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const units = await listUnitMaster();
  return NextResponse.json(
    { units },
    // 相手が古い単元表を掴んだまま到達度を送ってこないよう、キャッシュさせない
    { headers: { "cache-control": "no-store" } },
  );
}
