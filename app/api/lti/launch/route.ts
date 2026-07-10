import { NextResponse, type NextRequest } from "next/server";
import { getLtiConfig } from "@/lib/lti/config";
import { canvasJwks, LtiLaunchError, verifyLaunch } from "@/lib/lti/launch";
import { LTI_SESSION_COOKIE, signSession } from "@/lib/lti/session";

/**
 * LTI 1.3 起動（launch）。Canvasが id_token を form_post で送ってくる。
 * state/nonce をCookieと突合し、id_token を検証して本人確認セッションを発行する。
 * 成功後は自ホスト内の target へ遷移する（オープンリダイレクト防止）。
 */
export async function POST(request: NextRequest) {
  const cfg = getLtiConfig();
  if (!cfg) return new NextResponse("LTI連携は未設定です", { status: 501 });

  const sessionSecret = process.env.LTI_SESSION_SECRET;
  if (!sessionSecret) {
    return new NextResponse("LTI_SESSION_SECRET が未設定です", { status: 500 });
  }

  const form = await request.formData();
  const idToken = form.get("id_token")?.toString();
  const state = form.get("state")?.toString();

  const cookieState = request.cookies.get("lti_state")?.value;
  const nonce = request.cookies.get("lti_nonce")?.value;
  const target = request.cookies.get("lti_target")?.value;

  if (!idToken || !state) {
    return new NextResponse("起動パラメータが不足しています", { status: 400 });
  }
  // stateの一致（CSRF・突合）。Cookieが無い場合は SameSite/HTTPS 設定を疑う
  if (!cookieState || state !== cookieState || !nonce) {
    return new NextResponse(
      "起動の照合に失敗しました（時間切れか、Cookieが送られていません）",
      { status: 400 },
    );
  }

  let launch;
  try {
    launch = await verifyLaunch(idToken, cfg, nonce, canvasJwks(cfg));
  } catch (e) {
    if (e instanceof LtiLaunchError) return new NextResponse(e.message, { status: 401 });
    throw e;
  }

  const session = await signSession(
    { sub: launch.sub, role: launch.role, name: launch.name, courseId: launch.courseId },
    sessionSecret,
  );

  // 遷移先は自ホスト内のみ許可（それ以外はトップへ）
  let dest = "/";
  if (target && target.startsWith(`${cfg.toolUrl}/`)) {
    dest = target.slice(cfg.toolUrl.length) || "/";
  }

  const res = NextResponse.redirect(new URL(dest, cfg.toolUrl), 302);
  res.cookies.set(LTI_SESSION_COOKIE, session, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  // 使い終わった一時Cookieを消す
  for (const name of ["lti_state", "lti_nonce", "lti_target"]) {
    res.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
  return res;
}
