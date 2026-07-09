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
      res = await this.fetchFn(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "content-type": "application/json",
          ...init?.headers,
        },
      });
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
