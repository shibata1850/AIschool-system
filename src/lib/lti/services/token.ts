import { SignJWT } from "jose";

/**
 * LTI Advantage サービス用のアクセストークンを取得する（OAuth2 client_credentials +
 * JWT client assertion / RFC 7523）。ツールの秘密鍵で署名したJWTをトークンエンドポイントへ
 * 送り、access_token を得る。AGS（成績）・NRPS（名簿）で共通。
 */
export interface ServiceTokenOptions {
  /** LTI開発者キーのclient_id */
  clientId: string;
  /** Canvasのトークンエンドポイント */
  tokenUrl: string;
  /** ツールの署名鍵（getToolPrivateKey で取得） */
  privateKey: CryptoKey;
  /** JWKSに載せた鍵ID */
  kid: string;
  /** 要求スコープ（AGS/NRPSのURN） */
  scopes: string[];
}

export async function requestServiceToken(
  opts: ServiceTokenOptions,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: opts.kid })
    .setIssuer(opts.clientId)
    .setSubject(opts.clientId)
    .setAudience(opts.tokenUrl)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .setJti(crypto.randomUUID())
    .sign(opts.privateKey);

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: assertion,
    scope: opts.scopes.join(" "),
  });

  const res = await fetchFn(opts.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`LTIサービストークンの取得に失敗しました（HTTP ${res.status}）`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("access_token が返りませんでした");
  }
  return json.access_token;
}

/** LTI Advantage の代表的なスコープ */
export const LTI_SCOPES = {
  agsScore: "https://purl.imsglobal.org/spec/lti-ags/scope/score",
  agsLineItem: "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem",
  agsResult: "https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly",
  nrps: "https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly",
} as const;
