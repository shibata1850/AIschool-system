import type { LtiConfig } from "./config";
import { LTI_PATHS } from "./config";

/** Canvasからの third-party initiated login のパラメータ */
export interface LoginParams {
  iss: string;
  login_hint: string;
  target_link_uri: string;
  lti_message_hint?: string;
  client_id?: string;
}

export class LtiLoginError extends Error {}

/**
 * ログイン開始パラメータを検証する（issuer と client_id の一致確認）。
 * 不正なら LtiLoginError を投げる。
 */
export function validateLoginParams(cfg: LtiConfig, params: LoginParams): void {
  if (!params.iss) throw new LtiLoginError("iss がありません");
  if (params.iss !== cfg.issuer) {
    throw new LtiLoginError("issuer が設定と一致しません");
  }
  if (params.client_id && params.client_id !== cfg.clientId) {
    throw new LtiLoginError("client_id が設定と一致しません");
  }
  if (!params.login_hint) throw new LtiLoginError("login_hint がありません");
}

/**
 * OIDC認可リクエストのリダイレクトURLを組み立てる（state/nonce は呼び出し側で生成）。
 * response_mode=form_post / response_type=id_token（LTI 1.3 の implicit flow）。
 */
export function buildAuthRequestUrl(
  cfg: LtiConfig,
  params: LoginParams,
  state: string,
  nonce: string,
): string {
  const url = new URL(cfg.authUrl);
  const q = url.searchParams;
  q.set("scope", "openid");
  q.set("response_type", "id_token");
  q.set("response_mode", "form_post");
  q.set("prompt", "none");
  q.set("client_id", cfg.clientId);
  q.set("redirect_uri", `${cfg.toolUrl}${LTI_PATHS.launch}`);
  q.set("login_hint", params.login_hint);
  if (params.lti_message_hint) q.set("lti_message_hint", params.lti_message_hint);
  q.set("state", state);
  q.set("nonce", nonce);
  return url.toString();
}
