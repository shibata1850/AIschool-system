/**
 * クライアント共通のJSON POSTヘルパー。
 * エラー文言・タイムアウト時の扱いを1箇所に集約する（フォーム間の挙動ドリフト防止）。
 */

export type PostJsonResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      message: string;
      aborted?: boolean;
      /** HTTPステータス（通信自体が失敗したときは undefined） */
      status?: number;
      /** 応答がJSONだったときの本文（例: 503 の静的教材モード情報） */
      json?: unknown;
    };

export async function postJson<T = unknown>(
  url: string,
  body: unknown,
  options?: { signal?: AbortSignal },
): Promise<PostJsonResult<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: options?.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      let json: unknown;
      if (res.headers.get("content-type")?.includes("application/json")) {
        try {
          json = JSON.parse(text);
        } catch {
          json = undefined;
        }
      }
      return { ok: false, message: text, status: res.status, json };
    }
    let data: T;
    try {
      data = (await res.json()) as T;
    } catch {
      // 200でもJSONでない応答（中間層のエラーページ等）は成功扱いにしない
      return {
        ok: false,
        message: "サーバーの応答を読み取れませんでした。もう一度ためしてください",
      };
    }
    return { ok: true, data };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        ok: false,
        aborted: true,
        message: "時間がかかりすぎています。もう一度ためしてください",
      };
    }
    return {
      ok: false,
      message: "送信できませんでした。通信を確認してもう一度押してください",
    };
  }
}
