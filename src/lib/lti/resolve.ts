import type { Role } from "@/lib/auth";

const ROLES: Role[] = ["student", "teacher", "admin", "guest"];

/**
 * 有効なロールを決める純粋関数（proxy.ts と auth.ts が共通で使う）。
 * 優先順位:
 *  1) 検証済みLTIセッションのロール（本番の本人確認）
 *  2) LTIが設定済みでセッションが無い → guest（未ログイン扱い。Cookieロールは信用しない）
 *  3) LTI未設定 かつ 開発用Cookieロールが許可されている（DEV_COOKIE_ROLES）→ ロールCookie
 *  4) それ以外（＝本番でLTI設定漏れ等）→ **guest**（最小権限へ倒す・fail-closed）。
 *     開発時（isProduction=false）は従来どおり student として動かす
 *
 * 4について（2026-08-27 修正）: 以前は本番でも student を返していたが、これは
 * fail-openだった。LTI設定が漏れた本番環境では匿名アクセスが student として
 * 演習（/exercises）・AI講師（/api/chat）へ到達してしまう（実際にさくらの初回構築で
 * 発生。手動対応リスト B10）。最小権限の guest へ倒し、設定漏れが
 * 「使えない」形で表面化するようにする。
 */
export function resolveEffectiveRole(opts: {
  ltiRole: Role | null;
  ltiConfigured: boolean;
  cookieRole: string | undefined;
  /** 開発・デモ・E2EでのみtrueにしてCookieロールを昇格に使う（本番では既定false） */
  devCookieAllowed: boolean;
  /** 本番実行か（NODE_ENV=production）。LTI設定漏れ時の既定を guest に倒すために使う */
  isProduction?: boolean;
}): Role {
  if (opts.ltiRole) return opts.ltiRole;
  if (opts.ltiConfigured) return "guest";
  if (!opts.devCookieAllowed) return opts.isProduction ? "guest" : "student";
  return ROLES.includes(opts.cookieRole as Role) ? (opts.cookieRole as Role) : "student";
}
