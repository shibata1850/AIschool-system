import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import type { LtiConfig } from "./config";
import { mapLtiRoles } from "./roles";
import type { Role } from "@/lib/auth";

/** LTIクレームのURN（IMS仕様） */
const CLAIM = {
  messageType: "https://purl.imsglobal.org/spec/lti/claim/message_type",
  roles: "https://purl.imsglobal.org/spec/lti/claim/roles",
  context: "https://purl.imsglobal.org/spec/lti/claim/context",
  deploymentId: "https://purl.imsglobal.org/spec/lti/claim/deployment_id",
  targetLinkUri: "https://purl.imsglobal.org/spec/lti/claim/target_link_uri",
} as const;

export interface LtiLaunch {
  /** Canvasの利用者ID（本人確認の源泉。以後この値で提出・成績を紐づける） */
  sub: string;
  role: Role;
  name?: string;
  /** Canvasのコースコンテキストid */
  courseId?: string;
  deploymentId?: string;
  targetLinkUri?: string;
}

export class LtiLaunchError extends Error {}

/**
 * Canvasが署名した id_token を検証し、LTI起動情報を取り出す。
 * 署名鍵の解決は getKey に委譲する（本番は canvasJwks、テストはローカル鍵を注入）。
 */
export async function verifyLaunch(
  idToken: string,
  cfg: LtiConfig,
  expectedNonce: string,
  getKey: JWTVerifyGetKey,
): Promise<LtiLaunch> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(idToken, getKey, {
      issuer: cfg.issuer,
      audience: cfg.clientId,
      algorithms: ["RS256"], // 署名アルゴリズムを固定（alg混同・alg:noneを防ぐ）
    }));
  } catch {
    // 署名・iss・aud・期限の不正はまとめて起動失敗にする（詳細は漏らさない）
    throw new LtiLaunchError("id_token の検証に失敗しました");
  }

  if (!payload.sub) {
    throw new LtiLaunchError("利用者ID（sub）がありません");
  }
  if (!payload.nonce || payload.nonce !== expectedNonce) {
    throw new LtiLaunchError("nonce が一致しません（再送・改ざんの疑い）");
  }
  if (payload[CLAIM.messageType] !== "LtiResourceLinkRequest") {
    throw new LtiLaunchError("message_type が不正です");
  }
  const deploymentId = payload[CLAIM.deploymentId] as string | undefined;
  if (cfg.deploymentId && deploymentId !== cfg.deploymentId) {
    throw new LtiLaunchError("deployment_id が一致しません");
  }

  const roles = (payload[CLAIM.roles] as string[] | undefined) ?? [];
  const context = payload[CLAIM.context] as { id?: string } | undefined;
  return {
    sub: String(payload.sub),
    role: mapLtiRoles(roles),
    name: typeof payload.name === "string" ? payload.name : undefined,
    courseId: context?.id,
    deploymentId,
    targetLinkUri: payload[CLAIM.targetLinkUri] as string | undefined,
  };
}

/** 本番用: CanvasのJWKSから署名鍵を解決するリゾルバ */
export function canvasJwks(cfg: LtiConfig): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(cfg.jwksUrl));
}
