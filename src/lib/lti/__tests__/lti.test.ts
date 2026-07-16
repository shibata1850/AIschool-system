import { describe, expect, it } from "vitest";
import { SignJWT, exportJWK, generateKeyPair, type JWTVerifyGetKey } from "jose";
import { getLtiConfig, type LtiConfig } from "../config";
import { mapLtiRoles } from "../roles";
import { buildAuthRequestUrl, LtiLoginError, validateLoginParams } from "../login";
import { LtiLaunchError, verifyLaunch } from "../launch";
import { signSession, verifySession } from "../session";

const CFG: LtiConfig = {
  issuer: "https://canvas.example.jp",
  clientId: "10000000000001",
  authUrl: "https://canvas.example.jp/api/lti/authorize_redirect",
  jwksUrl: "https://canvas.example.jp/api/lti/security/jwks",
  tokenUrl: "https://canvas.example.jp/login/oauth2/token",
  toolUrl: "https://app.example.jp",
};

describe("getLtiConfig", () => {
  it("必須項目が欠けると null（Cookie動作へフォールバック）", () => {
    expect(getLtiConfig({})).toBeNull();
    expect(getLtiConfig({ LTI_ISSUER: "x", LTI_CLIENT_ID: "y" })).toBeNull();
  });
  it("揃っていれば設定を返す（toolUrlの末尾スラッシュは除去）", () => {
    const cfg = getLtiConfig({
      LTI_ISSUER: "https://c",
      LTI_CLIENT_ID: "cid",
      LTI_AUTH_URL: "https://c/auth",
      LTI_JWKS_URL: "https://c/jwks",
      LTI_TOOL_URL: "https://app/",
    });
    expect(cfg?.toolUrl).toBe("https://app");
  });
});

describe("mapLtiRoles", () => {
  it("上位ロールを優先して写像する", () => {
    expect(mapLtiRoles(["http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator"])).toBe("admin");
    expect(mapLtiRoles(["http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor"])).toBe("teacher");
    expect(mapLtiRoles(["http://purl.imsglobal.org/vocab/lis/v2/membership#Learner"])).toBe("student");
    expect(mapLtiRoles([])).toBe("guest");
    // 管理者と受講生が混在しても管理者を優先
    expect(mapLtiRoles(["...#Learner", "...#Administrator"])).toBe("admin");
  });
});

describe("validateLoginParams / buildAuthRequestUrl", () => {
  const params = {
    iss: CFG.issuer,
    login_hint: "user-123",
    target_link_uri: "https://app.example.jp/exercises/1",
    lti_message_hint: "hint-abc",
  };
  it("issuer不一致は拒否", () => {
    expect(() => validateLoginParams(CFG, { ...params, iss: "https://evil" })).toThrow(LtiLoginError);
  });
  it("client_id不一致は拒否", () => {
    expect(() => validateLoginParams(CFG, { ...params, client_id: "999" })).toThrow(LtiLoginError);
  });
  it("正しいパラメータは認可URLを組み立てる", () => {
    validateLoginParams(CFG, params);
    const url = new URL(buildAuthRequestUrl(CFG, params, "STATE1", "NONCE1"));
    expect(url.origin + url.pathname).toBe("https://canvas.example.jp/api/lti/authorize_redirect");
    expect(url.searchParams.get("response_type")).toBe("id_token");
    expect(url.searchParams.get("response_mode")).toBe("form_post");
    expect(url.searchParams.get("client_id")).toBe(CFG.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example.jp/api/lti/launch");
    expect(url.searchParams.get("state")).toBe("STATE1");
    expect(url.searchParams.get("nonce")).toBe("NONCE1");
    expect(url.searchParams.get("login_hint")).toBe("user-123");
  });
});

describe("verifyLaunch", () => {
  async function signedIdToken(
    claims: Record<string, unknown>,
    opts?: { iss?: string; aud?: string },
  ) {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer(opts?.iss ?? CFG.issuer)
      .setAudience(opts?.aud ?? CFG.clientId)
      .setSubject((claims.sub as string) ?? "user-123")
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(privateKey);
    const jwk = await exportJWK(publicKey);
    const getKey: JWTVerifyGetKey = async () => ({ ...jwk, alg: "RS256" }) as never;
    return { token, getKey };
  }

  const baseClaims = {
    sub: "user-123",
    name: "デモ講師（架空）",
    nonce: "NONCE1",
    "https://purl.imsglobal.org/spec/lti/claim/message_type": "LtiResourceLinkRequest",
    "https://purl.imsglobal.org/spec/lti/claim/roles": [
      "http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor",
    ],
    "https://purl.imsglobal.org/spec/lti/claim/context": { id: "course-1" },
    "https://purl.imsglobal.org/spec/lti/claim/deployment_id": "dep-1",
  };

  it("正当なid_tokenから本人・ロール・コースを取り出す", async () => {
    const { token, getKey } = await signedIdToken(baseClaims);
    const launch = await verifyLaunch(token, CFG, "NONCE1", getKey);
    expect(launch.sub).toBe("user-123");
    expect(launch.role).toBe("teacher");
    expect(launch.name).toBe("デモ講師（架空）");
    expect(launch.courseId).toBe("course-1");
  });

  it("nonce不一致は拒否（再送・改ざん対策）", async () => {
    const { token, getKey } = await signedIdToken(baseClaims);
    await expect(verifyLaunch(token, CFG, "DIFFERENT", getKey)).rejects.toThrow(LtiLaunchError);
  });

  it("audience（client_id）不一致は検証失敗", async () => {
    const { token, getKey } = await signedIdToken(baseClaims, { aud: "999" });
    await expect(verifyLaunch(token, CFG, "NONCE1", getKey)).rejects.toThrow(LtiLaunchError);
  });

  it("message_typeが不正なら拒否", async () => {
    const { token, getKey } = await signedIdToken({
      ...baseClaims,
      "https://purl.imsglobal.org/spec/lti/claim/message_type": "SomethingElse",
    });
    await expect(verifyLaunch(token, CFG, "NONCE1", getKey)).rejects.toThrow(LtiLaunchError);
  });

  it("sub（利用者ID）が無ければ拒否", async () => {
    const claims = { ...baseClaims };
    // subを空にする（jose setSubject を空文字で上書き）
    const { token, getKey } = await signedIdToken({ ...claims, sub: "" });
    await expect(verifyLaunch(token, CFG, "NONCE1", getKey)).rejects.toThrow(LtiLaunchError);
  });

  it("deployment_id が無ければ拒否（M-3）", async () => {
    const claims = { ...baseClaims };
    delete (claims as Record<string, unknown>)[
      "https://purl.imsglobal.org/spec/lti/claim/deployment_id"
    ];
    const { token, getKey } = await signedIdToken(claims);
    await expect(verifyLaunch(token, CFG, "NONCE1", getKey)).rejects.toThrow(LtiLaunchError);
  });

  it("AGS/NRPSのサービスエンドポイントを取り出す", async () => {
    const { token, getKey } = await signedIdToken({
      ...baseClaims,
      "https://purl.imsglobal.org/spec/lti-ags/claim/endpoint": {
        scope: ["https://purl.imsglobal.org/spec/lti-ags/scope/score"],
        lineitem: "https://canvas/api/lti/courses/1/line_items/9",
        lineitems: "https://canvas/api/lti/courses/1/line_items",
      },
      "https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice": {
        context_memberships_url: "https://canvas/api/lti/courses/1/names_and_roles",
      },
    });
    const launch = await verifyLaunch(token, CFG, "NONCE1", getKey);
    expect(launch.services.agsLineItem).toContain("line_items/9");
    expect(launch.services.nrpsUrl).toContain("names_and_roles");
    expect(launch.services.agsScopes).toContain(
      "https://purl.imsglobal.org/spec/lti-ags/scope/score",
    );
  });
});

describe("session（署名Cookie）", () => {
  const secret = "test-session-secret-of-sufficient-length-123456";
  it("署名→検証で本人・ロールを復元する", async () => {
    const token = await signSession({ sub: "user-9", role: "admin", name: "管理者" }, secret);
    const session = await verifySession(token, secret);
    expect(session?.sub).toBe("user-9");
    expect(session?.role).toBe("admin");
  });
  it("別の秘密鍵では検証に失敗し null", async () => {
    const token = await signSession({ sub: "user-9", role: "admin" }, secret);
    expect(await verifySession(token, "another-secret-entirely-different-000000")).toBeNull();
  });
  it("不正な文字列は null", async () => {
    expect(await verifySession("not-a-jwt", secret)).toBeNull();
    expect(await verifySession(undefined, secret)).toBeNull();
  });
});
