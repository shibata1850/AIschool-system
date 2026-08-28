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
  /** 開発者キーで設定するカスタムフィールド（canvas_user_id=$Canvas.user.id） */
  custom: "https://purl.imsglobal.org/spec/lti/claim/custom",
} as const;

/**
 * カスタムクレームからCanvasの数値ユーザーIDを取り出す（B-3の成績書き戻しに使う）。
 * LTIの sub はCanvasのREST APIが使う数値IDとは別値のため、開発者キー側で
 * `canvas_user_id=$Canvas.user.id` を設定してもらう必要がある（docs/LTI連携手順.md）。
 * 未設定・数値化できない場合は undefined（成績書き戻しは行われない）。
 */
export function readCanvasUserId(custom: unknown): number | undefined {
  if (typeof custom !== "object" || custom === null) return undefined;
  const raw = (custom as Record<string, unknown>).canvas_user_id;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

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
  /** LTIの利用者ID（本人確認の源泉。以後この値で提出を紐づける） */
  sub: string;
  /** CanvasのREST API用の数値ユーザーID（開発者キーのカスタムフィールド由来） */
  canvasUserId?: number;
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
    canvasUserId: readCanvasUserId(payload[CLAIM.custom]),
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
