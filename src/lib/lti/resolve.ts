import type { Role } from "@/lib/auth";

const ROLES: Role[] = ["student", "teacher", "admin", "guest"];

/**
 * 有効なロールを決める純粋関数（proxy.ts と auth.ts が共通で使う）。
 * 優先順位:
 *  1) 検証済みLTIセッションのロール（本番の本人確認）
 *  2) LTIが設定済みでセッションが無い → guest（未ログイン扱い。Cookieロールは信用しない）
 *  3) LTI未設定（開発・デモ・E2E）→ ロールCookie（既定 student）
 */
export function resolveEffectiveRole(opts: {
  ltiRole: Role | null;
  ltiConfigured: boolean;
  cookieRole: string | undefined;
}): Role {
  if (opts.ltiRole) return opts.ltiRole;
  if (opts.ltiConfigured) return "guest";
  return ROLES.includes(opts.cookieRole as Role) ? (opts.cookieRole as Role) : "student";
}
