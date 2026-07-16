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
  // LTI Advantage サービスのエンドポイント
  agsEndpoint: "https://purl.imsglobal.org/spec/lti-ags/claim/endpoint",
  nrps: "https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice",
} as const;

/** 起動時に得られるLTI Advantageサービスのエンドポイント（成績・名簿） */
export interface LtiServices {
  /** AGS: この resource link の lineitem URL（成績送信先） */
  agsLineItem?: string;
  /** AGS: lineitem 一覧URL */
  agsLineItems?: string;
  /** AGSで許可されたスコープ */
  agsScopes?: string[];
  /** NRPS: 名簿取得URL */
  nrpsUrl?: string;
}

export interface LtiLaunch {
  /** Canvasの利用者ID（本人確認の源泉。以後この値で提出・成績を紐づける） */
  sub: string;
  role: Role;
  name?: string;
  /** Canvasのコースコンテキストid */
  courseId?: string;
  deploymentId?: string;
  targetLinkUri?: string;
  /** LTI Advantageサービスのエンドポイント（成績・名簿） */
  services: LtiServices;
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
  // deployment_id はLTI必須クレーム。欠落を拒否し、設定があれば一致も要求する（M-3）
  if (!deploymentId) {
    throw new LtiLaunchError("deployment_id がありません");
  }
  if (cfg.deploymentId && deploymentId !== cfg.deploymentId) {
    throw new LtiLaunchError("deployment_id が一致しません");
  }

  const roles = (payload[CLAIM.roles] as string[] | undefined) ?? [];
  const context = payload[CLAIM.context] as { id?: string } | undefined;
  const ags = payload[CLAIM.agsEndpoint] as
    | { lineitem?: string; lineitems?: string; scope?: string[] }
    | undefined;
  const nrps = payload[CLAIM.nrps] as { context_memberships_url?: string } | undefined;
  return {
    sub: String(payload.sub),
    role: mapLtiRoles(roles),
    name: typeof payload.name === "string" ? payload.name : undefined,
    courseId: context?.id,
    deploymentId,
    targetLinkUri: payload[CLAIM.targetLinkUri] as string | undefined,
    services: {
      agsLineItem: ags?.lineitem,
      agsLineItems: ags?.lineitems,
      agsScopes: ags?.scope,
      nrpsUrl: nrps?.context_memberships_url,
    },
  };
}

/** 本番用: CanvasのJWKSから署名鍵を解決するリゾルバ */
export function canvasJwks(cfg: LtiConfig): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(cfg.jwksUrl));
}
