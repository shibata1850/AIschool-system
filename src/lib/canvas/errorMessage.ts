import { CanvasApiError } from "./client";

/**
 * Canvas連携の失敗を、画面・レポートに出してよい文言へ変換する。
 *
 * 応答本文は個人情報を含み得るため決して載せない。`CanvasApiError` のメッセージは
 * 本リポジトリ側で組み立てた安全な文言（トークン・本文を含まない）なので、
 * 接続不能（status 0）に限りそのまま通し、運用者が原因を切り分けられるようにする。
 * 2026-08-31: 本番の週次レポートが「fetch failed」としか出せなかったため追加。
 */
export function toErrorMessage(e: unknown): string {
  if (!(e instanceof CanvasApiError)) {
    return "Canvasとの通信中に想定外のエラーが発生しました。";
  }
  // status 0 = HTTP応答が返っていない（名前解決不可・接続拒否・TLS失敗など）
  if (e.status === 0) return e.message;
  if (e.status === 401) return "認証に失敗しました。アクセストークンを確認してください。";
  return `Canvasとの通信に失敗しました（HTTP ${e.status}）。`;
}
