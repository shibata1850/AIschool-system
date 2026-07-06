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

export class CanvasClient {
  private baseUrl: string;
  private apiToken: string;
  private fetchFn: typeof fetch;

  constructor(options: CanvasClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiToken = options.apiToken;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "content-type": "application/json",
        ...init?.headers,
      },
    });
    if (!res.ok) {
      // 応答本文に個人情報が含まれ得るため、エラーにはステータスのみ載せる
      throw new CanvasApiError(
        res.status,
        `Canvas APIの呼び出しに失敗しました（HTTP ${res.status}: ${path}）`,
      );
    }
    return (await res.json()) as T;
  }

  /** 接続確認（トークンの有効性チェック） */
  async getSelf(): Promise<CanvasUser> {
    return this.request<CanvasUser>("/api/v1/users/self");
  }

  /** 自分が参加しているコース一覧 */
  async listCourses(): Promise<CanvasCourse[]> {
    return this.request<CanvasCourse[]>("/api/v1/courses?per_page=100");
  }

  /** 課題の提出一覧（F4の学習ログ収集） */
  async listSubmissions(
    courseId: number,
    assignmentId: number,
  ): Promise<CanvasSubmission[]> {
    return this.request<CanvasSubmission[]>(
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
