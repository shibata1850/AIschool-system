/**
 * Canvas LMS（OSS版）REST APIクライアント（F1/F3/F4の接続層）。
 * 本体は改変せず、REST API経由でのみ連携する（CLAUDE.md 2章）。
 *
 * 参照実装のインメモリストア（src/lib/f3/store.ts）を置き換える際の
 * 接続部をここに集約する。実インスタンス（ステージング）接続後に
 * ストア差し替えとE2Eを行う — 手順は docs/Canvasステージング構築手順.md。
 */

export class CanvasApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface CanvasClientOptions {
  /** 例: https://canvas.example.jp （末尾スラッシュなし） */
  baseUrl: string;
  /** 管理画面で発行するアクセストークン（コミット禁止 — CLAUDE.md 2章） */
  apiToken: string;
  /** テスト用の差し替え口 */
  fetchFn?: typeof fetch;
  /** レート制限時の再試行間隔の基準（ミリ秒。テストでは0にする） */
  retryBaseDelayMs?: number;
}

export interface CanvasUser {
  id: number;
  name: string;
}

export interface CanvasCourse {
  id: number;
  name: string;
}

export interface CanvasSubmission {
  id: number;
  user_id: number;
  workflow_state: string;
  score: number | null;
  submitted_at: string | null;
  late: boolean;
}

export interface CanvasAssignment {
  id: number;
  name: string;
  /** 課題説明（HTMLを含み得る） */
  description: string | null;
  points_possible: number | null;
  /** 提出期限（ISO 8601）。未設定なら null */
  due_at: string | null;
  published: boolean;
}

/**
 * Linkヘッダーから rel="next" のURLを取り出す（RFC 5988 / Canvasのページネーション）。
 * 例: <https://canvas/api/v1/courses?page=2&per_page=100>; rel="next", <...>; rel="last"
 */
export function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

/** ページ追跡の上限（無限ループ防止。100件/頁 × 50頁 = 5,000件で本校の規模には十分） */
const MAX_PAGES = 50;

/** レート制限時の再試行回数（初回＋2回） */
const MAX_THROTTLE_RETRIES = 2;

/**
 * レート制限による失敗かを判定する。
 * Canvasはセルフホストでも既定でスロットリングが有効（request_throttle.enabled=true）。
 * 超過時は既定403（send_429_response設定で429）で、X-Rate-Limit-Remaining が "0" 系になる。
 * 403は権限エラーと同じコードのため、必ずヘッダーと組み合わせて判定する。
 */
function isThrottled(res: Response): boolean {
  if (res.status === 429) return true;
  if (res.status !== 403) return false;
  const remaining = res.headers.get("x-rate-limit-remaining");
  return remaining !== null && parseFloat(remaining) <= 0;
}

/**
 * ネットワーク層の失敗（Canvasに到達できていない）を、運用者が切り分けられる文言にする。
 *
 * 載せてよいもの: 接続先の **ホスト名のみ**（.envに書くがURLは秘密情報ではない）と
 * Node の下位エラーコード。載せてはいけないもの: APIトークン・パス・応答本文。
 * `CanvasApiError.status = 0` は「HTTP応答が返っていない」ことを表す（HTTPエラーと区別する）。
 */
export function describeNetworkFailure(baseUrl: string, cause: unknown): string {
  let host: string;
  try {
    host = new URL(baseUrl).host;
  } catch {
    host = "(CANVAS_BASE_URLが不正なURL)";
  }
  const code = extractErrorCode(cause);
  const hint = code ? NETWORK_HINTS[code] : undefined;
  return [
    `Canvasへ接続できませんでした（接続先: ${host}${code ? ` / ${code}` : ""}）。`,
    hint ?? "CANVAS_BASE_URL の値と、アプリからCanvasへの疎通を確認してください。",
  ].join("");
}

/** Node の fetch は真因を error.cause（さらにその cause）に入れるため、code を掘り出す */
function extractErrorCode(cause: unknown): string | undefined {
  for (let e = cause, depth = 0; e && depth < 5; depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

const NETWORK_HINTS: Record<string, string> = {
  ECONNREFUSED:
    "接続は届いたが拒否されました。Dockerで動かしている場合、CANVAS_BASE_URL の localhost/127.0.0.1 は" +
    "**コンテナ自身**を指すため届きません（infra/custom-layer/README.md「Canvasへの到達性」参照）。",
  ENOTFOUND: "ホスト名を解決できませんでした。CANVAS_BASE_URL のホスト名とDNSを確認してください。",
  EAI_AGAIN: "DNSの一時的な失敗です。名前解決の設定を確認し、時間をおいて再実行してください。",
  ETIMEDOUT: "接続がタイムアウトしました。経路上のファイアウォール・セキュリティグループを確認してください。",
  UND_ERR_CONNECT_TIMEOUT:
    "接続がタイムアウトしました。経路上のファイアウォール・セキュリティグループを確認してください。",
  CERT_HAS_EXPIRED: "サーバー証明書の期限が切れています。",
  DEPTH_ZERO_SELF_SIGNED_CERT:
    "自己署名証明書のため検証に失敗しました。正規の証明書を設定してください（検証の無効化は禁止）。",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE:
    "証明書チェーンを検証できませんでした。中間証明書の設定を確認してください。",
};

export class CanvasClient {
  private baseUrl: string;
  private apiToken: string;
  private fetchFn: typeof fetch;
  private retryBaseDelayMs: number;

  constructor(options: CanvasClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiToken = options.apiToken;
    this.fetchFn = options.fetchFn ?? fetch;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 1000;
  }

  private async requestRaw(url: string, init?: RequestInit): Promise<Response> {
    let res: Response;
    for (let attempt = 0; ; attempt++) {
      try {
        res = await this.fetchFn(url, {
          ...init,
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            "content-type": "application/json",
            ...init?.headers,
          },
        });
      } catch (cause) {
        // 名前解決不可・接続拒否・TLS失敗などは fetch が素の TypeError（"fetch failed"）を
        // 投げ、真因は cause に隠れる。そのままだと運用者が原因を切り分けられないため、
        // **接続先ホストと下位の原因コード**を載せた CanvasApiError に変換する。
        throw new CanvasApiError(0, describeNetworkFailure(this.baseUrl, cause));
      }
      if (res.ok || !isThrottled(res) || attempt >= MAX_THROTTLE_RETRIES) break;
      // レート制限は指数バックオフで再試行（1秒 → 2秒）
      await new Promise((r) => setTimeout(r, this.retryBaseDelayMs * 2 ** attempt));
    }
    if (!res.ok) {
      // 応答本文に個人情報が含まれ得るため、エラーにはステータスのみ載せる
      const path = url.startsWith(this.baseUrl) ? url.slice(this.baseUrl.length) : "(外部URL)";
      throw new CanvasApiError(
        res.status,
        isThrottled(res)
          ? `Canvas APIのレート制限を超過しました（HTTP ${res.status}: ${path}）。時間をおいて再実行してください`
          : `Canvas APIの呼び出しに失敗しました（HTTP ${res.status}: ${path}）`,
      );
    }
    return res;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.requestRaw(`${this.baseUrl}${path}`, init);
    return (await res.json()) as T;
  }

  /**
   * 一覧APIをLinkヘッダー（rel="next"）で全ページ取得する。
   * Canvasの一覧APIは既定10件/頁のため、per_page指定＋追跡がないと取りこぼす。
   */
  private async requestAllPages<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    let url: string | null = `${this.baseUrl}${path}`;
    for (let page = 0; page < MAX_PAGES && url; page++) {
      const res: Response = await this.requestRaw(url);
      items.push(...((await res.json()) as T[]));
      // Headers.get はヘッダー名を大文字小文字区別なく解決する（Linkの大文字化は保証されない）
      const next = parseNextLink(res.headers.get("link"));
      // トークン付きリクエストが外部へ飛ばないよう、次ページは自ホストのURLのみ辿る
      url = next && next.startsWith(this.baseUrl) ? next : null;
    }
    return items;
  }

  /** 接続確認（トークンの有効性チェック） */
  async getSelf(): Promise<CanvasUser> {
    return this.request<CanvasUser>("/api/v1/users/self");
  }

  /** 自分が参加しているコース一覧（全ページ取得） */
  async listCourses(): Promise<CanvasCourse[]> {
    return this.requestAllPages<CanvasCourse>("/api/v1/courses?per_page=100");
  }

  /**
   * コースの受講生名簿（F1: ユーザー管理・S9デバイス割当の突合に使用）。
   * enrollment_type[]=student で講師・TA・オブザーバーを除外する。
   */
  async listStudents(courseId: number): Promise<CanvasUser[]> {
    return this.requestAllPages<CanvasUser>(
      `/api/v1/courses/${courseId}/users?enrollment_type[]=student&per_page=100`,
    );
  }

  /**
   * コースの講師・TA名簿（F4: 週次レポートの通知先）。
   * enrollment_type[]=teacher と ta を指定し、受講生を除外する。
   */
  async listTeachers(courseId: number): Promise<CanvasUser[]> {
    return this.requestAllPages<CanvasUser>(
      `/api/v1/courses/${courseId}/users?enrollment_type[]=teacher&enrollment_type[]=ta&per_page=100`,
    );
  }

  /**
   * Canvasメッセージ（会話）を送る（F4: 週次レポートの自動通知）。
   * 本文に受講生個人の点数を含めないこと（メッセージは平文で残る — 要件定義書5.3）。
   */
  async createConversation(
    recipientIds: number[],
    subject: string,
    body: string,
  ): Promise<void> {
    if (recipientIds.length === 0) {
      throw new Error("通知先が空です");
    }
    const params = new URLSearchParams();
    for (const id of recipientIds) params.append("recipients[]", String(id));
    params.set("subject", subject);
    params.set("body", body);
    // 宛先ごとに個別の会話にする（受信者同士が互いに見えないようにする）
    params.set("group_conversation", "false");
    params.set("mode", "async");

    await this.request<unknown>("/api/v1/conversations", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  }

  /** コースの課題一覧（F3: プロンプト演習の出題元・全ページ取得） */
  async listAssignments(courseId: number): Promise<CanvasAssignment[]> {
    return this.requestAllPages<CanvasAssignment>(
      `/api/v1/courses/${courseId}/assignments?per_page=100`,
    );
  }

  /** 課題の提出一覧（F4の学習ログ収集・全ページ取得） */
  async listSubmissions(
    courseId: number,
    assignmentId: number,
  ): Promise<CanvasSubmission[]> {
    return this.requestAllPages<CanvasSubmission>(
      `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions?per_page=100`,
    );
  }

  /**
   * 成績をCanvasの成績表へ反映する（F3: 講師確定スコア）。
   * コメントは受講生に表示される講評として添付できる。
   */
  async gradeSubmission(
    courseId: number,
    assignmentId: number,
    userId: number,
    score: number,
    comment?: string,
  ): Promise<CanvasSubmission> {
    if (score < 0 || score > 100) {
      throw new Error("スコアは0〜100で指定してください");
    }
    return this.request<CanvasSubmission>(
      `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`,
      {
        method: "PUT",
        body: JSON.stringify({
          submission: { posted_grade: String(score) },
          ...(comment ? { comment: { text_comment: comment } } : {}),
        }),
      },
    );
  }
}

/**
 * 環境変数からクライアントを生成する。未設定なら null
 * （参照実装はインメモリストアで動作を継続する）。
 */
export function createCanvasClient(
  env: Record<string, string | undefined> = process.env,
): CanvasClient | null {
  const baseUrl = env.CANVAS_BASE_URL;
  const apiToken = env.CANVAS_API_TOKEN;
  if (!baseUrl || !apiToken) return null;
  return new CanvasClient({ baseUrl, apiToken });
}
