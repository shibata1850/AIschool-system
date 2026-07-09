import { CanvasApiError, type CanvasClient, type CanvasCourse, type CanvasUser } from "./client";

/**
 * Canvas接続の状態（S9管理・連携確認画面で表示する）。
 * - notConfigured: CANVAS_BASE_URL/TOKEN 未設定（参照実装はインメモリで動作）
 * - ok: 接続成功。管理者情報とコース一覧を保持
 * - error: 接続失敗（トークン失効・URL誤り・レート制限など）。本文は漏らさない
 */
export type CanvasStatus =
  | { state: "notConfigured" }
  | { state: "ok"; me: CanvasUser; courses: CanvasCourse[] }
  | { state: "error"; message: string };

/**
 * 接続状態を取得する。例外を投げず、必ず状態オブジェクトを返す
 * （画面側は分岐して表示するだけでよい）。
 */
export async function fetchCanvasStatus(client: CanvasClient | null): Promise<CanvasStatus> {
  if (!client) return { state: "notConfigured" };
  try {
    const me = await client.getSelf();
    const courses = await client.listCourses();
    return { state: "ok", me, courses };
  } catch (e) {
    // 個人情報を含み得るため応答本文は載せず、対処につながる文言のみ返す
    const message =
      e instanceof CanvasApiError
        ? e.status === 401
          ? "認証に失敗しました。アクセストークンが失効していないか確認してください。"
          : e.status === 429 || e.status === 403
            ? "Canvasのレート制限または権限エラーです。時間をおくか権限を確認してください。"
            : `Canvasへの接続に失敗しました（HTTP ${e.status}）。URLと状態を確認してください。`
        : "Canvasへの接続中に想定外のエラーが発生しました。";
    return { state: "error", message };
  }
}
