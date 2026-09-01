import { timingSafeEqual } from "node:crypto";

/**
 * 外部システム連携API（E7）の認証。
 *
 * 相手はeラーニングシステム（姉妹システム）で、人ではなくサーバーである。
 * **Canvasの管理者トークンは渡さない** — 成績・名簿・個人情報まで触れる権限があり、
 * 単元参照や到達度送信のために渡すのは過大（docs/eラーニング連携.md 3.2.1 E7-b）。
 * 代わりに、この連携のためだけの専用トークンを1本発行して使う。
 *
 * fail-closed: トークンが未設定なら「認証できない」ではなく「機能が無効」を返す。
 * 設定漏れのまま誰でも叩ける状態にしない（LTIロール解決と同じ方針）。
 */

export type IntegrationAuthResult =
  | { ok: true }
  /** 連携が未設定。503を返す（401ではない。設定漏れと認証失敗を混同させない） */
  | { ok: false; status: 503; message: string }
  /** トークン不一致・欠落 */
  | { ok: false; status: 401; message: string };

/** 長さが違っても比較時間を一定にする（長さで秘密が漏れないようにする） */
function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // 長さが違う時点で不一致だが、早期returnしないよう同じ長さで1回比較してから返す
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * `Authorization: Bearer <token>` を検証する。
 * 期待値は環境変数 INTEGRATION_API_TOKEN（コミット禁止 — CLAUDE.md 2章）。
 */
export function verifyIntegrationToken(
  headerValue: string | null,
  env: Record<string, string | undefined> = process.env,
): IntegrationAuthResult {
  const expected = env.INTEGRATION_API_TOKEN;
  if (!expected) {
    return {
      ok: false,
      status: 503,
      message: "外部システム連携は未設定です（INTEGRATION_API_TOKEN）",
    };
  }
  // 短すぎるトークンを設定してしまう事故を防ぐ（総当たりへの耐性が無くなる）
  if (expected.length < 32) {
    return {
      ok: false,
      status: 503,
      message: "INTEGRATION_API_TOKEN が短すぎます（32文字以上にしてください）",
    };
  }

  const prefix = "Bearer ";
  if (!headerValue || !headerValue.startsWith(prefix)) {
    return { ok: false, status: 401, message: "認証が必要です" };
  }
  const presented = headerValue.slice(prefix.length);
  if (!constantTimeEquals(presented, expected)) {
    return { ok: false, status: 401, message: "認証に失敗しました" };
  }
  return { ok: true };
}
