import { NextResponse, type NextRequest } from "next/server";

/**
 * 権限ガード（docs/要件定義書.md 5.1）。
 * 権限外画面へのURL直接アクセスは403を返す（E2E必須項目）。
 * 参照実装ではロールをCookieで模擬する（本番はCanvas/LTI 1.3のロールに置換）。
 */
export function proxy(request: NextRequest) {
  const role = request.cookies.get("role")?.value ?? "student";
  const path = request.nextUrl.pathname;

  const teacherOnly = path.startsWith("/teacher") || path.startsWith("/api/submissions");
  if (teacherOnly && role !== "teacher" && role !== "admin") {
    return new NextResponse(
      "この画面を見る権限がありません（先生・管理者だけが使えます）",
      { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  // ゲスト（体験会）はトップと公開教材のみ。演習・チャット・到達度は不可（権限マトリクス 5.1）
  const noGuest =
    path.startsWith("/chat") ||
    path.startsWith("/api/chat") ||
    path.startsWith("/exercises") ||
    path.startsWith("/api/exercises") ||
    path.startsWith("/achievement");
  if (noGuest && role === "guest") {
    return new NextResponse(
      "この機能を使う権限がありません（受講生として登録すると使えます）",
      { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/teacher/:path*",
    "/api/submissions/:path*",
    "/chat",
    "/api/chat",
    "/exercises/:path*",
    "/api/exercises/:path*",
    "/achievement",
  ],
};
