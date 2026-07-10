import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/lib/auth";

/**
 * LTI起動後の本人確認セッション（署名付きCookieに格納するペイロード）。
 * proxy.ts / auth.ts はこのセッションを正としてロール・IDを判定する（本番）。
 */
export interface LtiSession {
  /** Canvasの利用者ID */
  sub: string;
  role: Role;
  name?: string;
  courseId?: string;
}

/** セッションCookie名 */
export const LTI_SESSION_COOKIE = "lti_session";

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** セッションを署名（HS256・8時間有効） */
export async function signSession(session: LtiSession, secret: string): Promise<string> {
  return new SignJWT({
    role: session.role,
    name: session.name,
    courseId: session.courseId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.sub)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secretKey(secret));
}

/** セッションCookieを検証。改ざん・期限切れ・不正は null */
export async function verifySession(
  token: string | undefined,
  secret: string,
): Promise<LtiSession | null> {
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), {
      algorithms: ["HS256"], // 署名アルゴリズムを固定
    });
    if (!payload.sub || !payload.role) return null;
    return {
      sub: String(payload.sub),
      role: payload.role as Role,
      name: typeof payload.name === "string" ? payload.name : undefined,
      courseId: typeof payload.courseId === "string" ? payload.courseId : undefined,
    };
  } catch {
    return null;
  }
}
