import { NextResponse, type NextRequest } from "next/server";
import { getLtiConfig } from "@/lib/lti/config";
import { LTI_SESSION_COOKIE, verifySession } from "@/lib/lti/session";
import { resolveEffectiveRole } from "@/lib/lti/resolve";

/**
 * 権限ガード（docs/要件定義書.md 5.1）。
 * 権限外画面へのURL直接アクセスは403を返す（E2E必須項目）。
 * 参照実装ではロールをCookieで模擬する（本番はCanvas/LTI 1.3のロールに置換）。
 *
 * 2026-07-03 監査指摘#10の修正:
 * ガード対象パスは下の定数リスト1箇所で管理する（matcherとの二重管理をやめ、
 * matcherは静的アセット以外の全リクエストを通す）。配下パスも前方一致で守る。
 */

/** 管理者のみ（監査ログ閲覧 — 要件定義書5.2） */
const ADMIN_ONLY_PREFIXES = ["/admin"];

/** 講師・管理者のみ（開発用リセットAPIも破壊的操作のためここに含める） */
const TEACHER_ONLY_PREFIXES = [
  "/teacher",
  "/api/submissions",
  "/api/devices",
  "/api/dev",
  "/api/teacher",
];

/** ゲスト（体験会）不可: 演習・チャット・到達度（トップと公開教材のみ閲覧可） */
const NO_GUEST_PREFIXES = [
  "/chat",
  "/api/chat",
  "/exercises",
  "/api/exercises",
  "/achievement",
  "/jupyter",
];

function matchesPrefix(path: string, prefixes: string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * 有効なロールを解決する。LTIセッションがあればそれを正とし、無ければロールCookie
 * （開発・デモ）。LTI設定済みでセッションが無ければ guest（Cookieロールは信用しない）。
 */
async function resolveRole(request: NextRequest): Promise<string> {
  const token = request.cookies.get(LTI_SESSION_COOKIE)?.value;
  const session = token
    ? await verifySession(token, process.env.LTI_SESSION_SECRET ?? "")
    : null;
  return resolveEffectiveRole({
    ltiRole: session?.role ?? null,
    ltiConfigured: getLtiConfig() != null,
    cookieRole: request.cookies.get("role")?.value,
  });
}

export async function proxy(request: NextRequest) {
  const role = await resolveRole(request);
  const path = request.nextUrl.pathname;

  if (matchesPrefix(path, ADMIN_ONLY_PREFIXES) && role !== "admin") {
    return new NextResponse(
      "この画面を見る権限がありません（管理者だけが使えます）",
      { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  if (
    matchesPrefix(path, TEACHER_ONLY_PREFIXES) &&
    role !== "teacher" &&
    role !== "admin"
  ) {
    return new NextResponse(
      "この画面を見る権限がありません（先生・管理者だけが使えます）",
      { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  if (matchesPrefix(path, NO_GUEST_PREFIXES) && role === "guest") {
    return new NextResponse(
      "この機能を使う権限がありません（受講生として登録すると使えます）",
      { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  return NextResponse.next();
}

export const config = {
  // 静的アセット以外の全リクエストを通す。パスの列挙は上の定数のみで行う
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
