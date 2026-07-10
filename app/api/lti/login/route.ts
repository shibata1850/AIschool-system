import { NextResponse, type NextRequest } from "next/server";
import { getLtiConfig } from "@/lib/lti/config";
import { buildAuthRequestUrl, LtiLoginError, validateLoginParams, type LoginParams } from "@/lib/lti/login";

/**
 * LTI 1.3 OIDC ログイン開始（third-party initiated login）。
 * CanvasがGET/POSTで呼ぶ。state/nonce を生成してCookieに保存し、Canvasの認可URLへ転送する。
 * LTI未設定時は501（参照実装はロールCookieで動作）。
 */
async function readParams(request: NextRequest): Promise<LoginParams> {
  if (request.method === "POST") {
    const form = await request.formData();
    return {
      iss: String(form.get("iss") ?? ""),
      login_hint: String(form.get("login_hint") ?? ""),
      target_link_uri: String(form.get("target_link_uri") ?? ""),
      lti_message_hint: form.get("lti_message_hint")?.toString(),
      client_id: form.get("client_id")?.toString(),
    };
  }
  const q = request.nextUrl.searchParams;
  return {
    iss: q.get("iss") ?? "",
    login_hint: q.get("login_hint") ?? "",
    target_link_uri: q.get("target_link_uri") ?? "",
    lti_message_hint: q.get("lti_message_hint") ?? undefined,
    client_id: q.get("client_id") ?? undefined,
  };
}

async function handle(request: NextRequest) {
  const cfg = getLtiConfig();
  if (!cfg) {
    return new NextResponse("LTI連携は未設定です", { status: 501 });
  }
  const params = await readParams(request);
  try {
    validateLoginParams(cfg, params);
  } catch (e) {
    if (e instanceof LtiLoginError) return new NextResponse(e.message, { status: 400 });
    throw e;
  }

  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const redirectUrl = buildAuthRequestUrl(cfg, params, state, nonce);

  const res = NextResponse.redirect(redirectUrl, 302);
  // Canvas→ツールの form_post（クロスサイト）で送られるよう SameSite=None; Secure
  const cookieOpts = {
    httpOnly: true,
    secure: true,
    sameSite: "none" as const,
    path: "/",
    maxAge: 600,
  };
  res.cookies.set("lti_state", state, cookieOpts);
  res.cookies.set("lti_nonce", nonce, cookieOpts);
  // 起動後の遷移先（自ホスト内のみ許可するため検証はlaunch側で行う）
  res.cookies.set("lti_target", params.target_link_uri, cookieOpts);
  return res;
}

export const GET = handle;
export const POST = handle;
