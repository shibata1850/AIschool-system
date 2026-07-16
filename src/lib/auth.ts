import { cookies } from "next/headers";
import { getLtiConfig } from "@/lib/lti/config";
import { LTI_SESSION_COOKIE, verifySession } from "@/lib/lti/session";
import { resolveEffectiveRole } from "@/lib/lti/resolve";

/** アプリ内のロール（本番はLTI 1.3のロールから写像する — src/lib/lti/roles.ts） */
export type Role = "student" | "teacher" | "admin" | "guest";

export interface CurrentUser {
  role: Role;
  /** 利用者ID。LTI起動時はCanvasの利用者ID、デモ時は固定の架空ID */
  userId: string;
  name?: string;
  /** LTIセッション由来か（デモ・E2EのCookie判定と区別する） */
  viaLti: boolean;
}

/**
 * 現在の利用者（ロール・ID）を解決する。
 * - LTIセッションがあればそれを正とする（本番の本人確認）
 * - 無ければロールCookie（開発・デモ・E2E）。LTI設定済みなら未ログイン=guest
 * ロール・ID散在を防ぐため、画面・APIはこの関数を経由する。
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  const store = await cookies();
  const token = store.get(LTI_SESSION_COOKIE)?.value;
  const ltiSession = token
    ? await verifySession(token, process.env.LTI_SESSION_SECRET ?? "")
    : null;

  const role = resolveEffectiveRole({
    ltiRole: ltiSession?.role ?? null,
    ltiConfigured: getLtiConfig() != null,
    cookieRole: store.get("role")?.value,
    devCookieAllowed: process.env.DEV_COOKIE_ROLES === "1",
  });

  // デモ表示モード（DEMO_RICH_SEED=1）では、生徒向け画面を「デモ生徒」の
  // データで見せる。実ユーザー（LTI起動）でも一貫したデモ体験が見えるようにする。
  const demoMode = process.env.DEMO_RICH_SEED === "1";

  if (ltiSession) {
    return {
      role,
      userId: demoMode ? "student-demo" : ltiSession.sub,
      name: ltiSession.name,
      viaLti: true,
    };
  }
  // デモ・E2E: 学習データは架空のデモ受講生に紐づく
  return { role, userId: "student-demo", viaLti: false };
}
