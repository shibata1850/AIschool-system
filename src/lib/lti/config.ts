/**
 * LTI 1.3 連携の設定（Canvasの開発者キー登録後に .env へ設定する）。
 * 未設定なら null を返し、その場合は参照実装のロールCookie（開発・デモ用）で動作する
 * （docs/LTI連携手順.md）。本番はここが埋まり、Canvasログインが本人確認の源泉になる。
 */
export interface LtiConfig {
  /** Canvasの issuer（例: https://canvas.example.jp） */
  issuer: string;
  /** Canvas開発者キーで発行される client_id */
  clientId: string;
  /** Canvasの認可リダイレクト先（authorization endpoint） */
  authUrl: string;
  /** Canvasの公開鍵JWKS（id_token検証用） */
  jwksUrl: string;
  /** Canvasのトークンエンドポイント（AGS/NRPS用・将来利用） */
  tokenUrl: string;
  /** カスタム層の公開URL（末尾スラッシュなし。redirect_uri の組み立てに使う） */
  toolUrl: string;
  /** 期待する deployment_id（設定時のみ検証） */
  deploymentId?: string;
}

export function getLtiConfig(
  env: Record<string, string | undefined> = process.env,
): LtiConfig | null {
  const issuer = env.LTI_ISSUER;
  const clientId = env.LTI_CLIENT_ID;
  const authUrl = env.LTI_AUTH_URL;
  const jwksUrl = env.LTI_JWKS_URL;
  const toolUrl = env.LTI_TOOL_URL;
  // 起動フローに最低限必要な項目が揃っていなければ LTI 無効（Cookie動作へフォールバック）
  if (!issuer || !clientId || !authUrl || !jwksUrl || !toolUrl) return null;
  return {
    issuer,
    clientId,
    authUrl,
    jwksUrl,
    tokenUrl: env.LTI_TOKEN_URL ?? "",
    toolUrl: toolUrl.replace(/\/+$/, ""),
    deploymentId: env.LTI_DEPLOYMENT_ID,
  };
}

/** カスタム層側のLTIエンドポイント（Canvas登録に使う相対パス） */
export const LTI_PATHS = {
  login: "/api/lti/login",
  launch: "/api/lti/launch",
  jwks: "/api/lti/jwks",
} as const;
