import { exportJWK, importPKCS8 } from "jose";

/** ツールの署名秘密鍵（LTI Advantageのサービス署名用）。未設定なら null */
export async function getToolPrivateKey(
  env: Record<string, string | undefined> = process.env,
): Promise<CryptoKey | null> {
  const pem = env.LTI_PRIVATE_KEY;
  if (!pem) return null;
  const normalized = pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;
  return importPKCS8(normalized, "RS256", { extractable: false });
}

/**
 * カスタム層（ツール）側の署名鍵。LTI Advantage サービス（成績・名簿の
 * サービス呼び出し）でツールが署名する際に使う。基本の起動検証には不要。
 * 秘密鍵は .env（LTI_PRIVATE_KEY, PKCS8 PEM）に置く（コミット禁止）。
 */

const ALG = "RS256";

/** 環境変数の PEM（\n をエスケープしていても復元）を取り出す */
function readPem(env: Record<string, string | undefined>): string | null {
  const pem = env.LTI_PRIVATE_KEY;
  if (!pem) return null;
  return pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;
}

/**
 * 公開JWK（Canvasに登録するJWKS用）を返す。鍵未設定なら null。
 * 秘密成分（d, p, q, dp, dq, qi）は除去して公開鍵のみにする。
 */
export async function getToolPublicJwk(
  env: Record<string, string | undefined> = process.env,
): Promise<Record<string, unknown> | null> {
  const pem = readPem(env);
  if (!pem) return null;
  const key = await importPKCS8(pem, ALG, { extractable: true });
  const jwk = (await exportJWK(key)) as Record<string, unknown>;
  for (const secret of ["d", "p", "q", "dp", "dq", "qi"]) delete jwk[secret];
  jwk.use = "sig";
  jwk.alg = ALG;
  jwk.kid = env.LTI_KEY_ID ?? "ngais-tool-key";
  return jwk;
}
