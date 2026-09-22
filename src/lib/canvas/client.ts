/**
 * Canvas LMS（OSS版）REST APIクライアント（F1/F3/F4の接続層）。
 * 本体は改変せず、REST API経由でのみ連携する（CLAUDE.md 2章）。
 *
 * 参照実装のインメモリストア（src/lib/f3/store.ts）を置き換える際の
 * 接続部をここに集約する。実インスタンス（ステージング）接続後に
 * ストア差し替えとE2Eを行う — 手順は docs/Canvasステージング構築手順.md。
 */

import { isObject, positiveId, evidenceSignature, requiresManualReviewQuizType, type QuizEvidence } from "../quiz-review/verification";
import {readExistingReport} from "../quiz-review/report";
import {prepareReport} from "../quiz-review/preparation";

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
  lti_context_id?: string;
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
  prepareQuizReport(courseId:number,quizId:number,expectedOrigin:string,requestCreation:boolean) {
    return prepareReport({baseUrl:this.baseUrl,apiToken:this.apiToken,fetchFn:this.fetchFn},courseId,quizId,expectedOrigin,requestCreation);
  }
  readExistingQuizReport(courseId:number,quizId:number,expectedOrigin:string) {
    return readExistingReport({baseUrl:this.baseUrl,apiToken:this.apiToken,fetchFn:this.fetchFn},courseId,quizId,expectedOrigin);
  }
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

  /** Root-account catalog for staff browsing, independent of token-owner enrollment. */
  async listAccountCourses(): Promise<CanvasCourse[]> {
    const courses = await this.requestAllPages<CanvasCourse>("/api/v1/accounts/self/courses?per_page=100");
    if (courses.some(course => !course || !Number.isSafeInteger(course.id) || course.id <= 0 || typeof course.name !== "string")) {
      throw new Error("Canvasのコース一覧を確認できませんでした");
    }
    return [...new Map(courses.map(course => [course.id, course])).values()];
  }

  /** Resolve only the verified LTI context; never substitute the first visible course. */
  async getCourseByLtiContext(contextId: string): Promise<CanvasCourse> {
    if (!contextId.trim()) throw new Error("LTIのコース情報がありません");
    const course = await this.request<CanvasCourse>(
      `/api/v1/courses/lti_context_id:${encodeURIComponent(contextId)}?include[]=lti_context_id`,
    );
    if (!course || !Number.isSafeInteger(course.id) || course.id <= 0 ||
        course.lti_context_id !== contextId || typeof course.name !== "string") {
      throw new Error("Canvasのコース情報を照合できませんでした");
    }
    return course;
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

  /** Fail closed: recorded LTI membership alone is not current enrollment. */
  async hasActiveEnrollment(courseId: number, userId: number, kind: "student" | "teacher"): Promise<boolean> {
    if (![courseId, userId].every(id => Number.isSafeInteger(id) && id > 0)) return false;
    const type = kind === "student" ? "StudentEnrollment" : "TeacherEnrollment";
    const rows = await this.request<Array<{user_id: number; course_id: number; type: string; enrollment_state: string}>>(
      `/api/v1/courses/${courseId}/enrollments?user_id=${userId}&type[]=${type}&state[]=active&per_page=100`,
    );
    return Array.isArray(rows) && rows.some(row => row.user_id === userId && row.course_id === courseId &&
      row.type === type && row.enrollment_state === "active");
  }

  /** Read-only, single-user Classic Quiz evidence. Never follow external paging URLs. */
  async readQuizReviewEvidence(courseId:number, quizId:number, userId:number):Promise<QuizEvidence> {
    const invalid=():never=>{throw new CanvasApiError(0,"Canvasの照合情報を確認できません");};
    if(![courseId,quizId,userId].every(positiveId)) return invalid();
    const init:RequestInit={cache:"no-store",redirect:"error",signal:AbortSignal.timeout(20000)};
    const prefix=`/api/v1/courses/${courseId}/quizzes/${quizId}`;
    const quiz=await this.request<unknown>(prefix,init);
    if(!isObject(quiz)||quiz.id!==quizId) return invalid();
    // Practice quizzes have no assignment submission history. Do not retry as a network failure
    // or silently change their grading type merely to make this adapter work.
    if(requiresManualReviewQuizType(quiz.quiz_type)) return {quiz,submission:null,current:null,questions:null,attemptQuestions:null};
    if(!positiveId(quiz.assignment_id)) return invalid();
    const submissionPath=`/api/v1/courses/${courseId}/assignments/${quiz.assignment_id}/submissions/${userId}?include[]=submission_history`;
    const submission=await this.request<unknown>(submissionPath,init);
    if(!isObject(submission)||submission.user_id!==userId||submission.assignment_id!==quiz.assignment_id||
        !Array.isArray(submission.submission_history)||submission.submission_history.length>100) return invalid();
    const history=submission.submission_history;
    if(!history.length||history.some(h=>!isObject(h)||!positiveId(h.attempt)||!positiveId(h.id))) return invalid();
    const latest=Math.max(...history.map(h=>(h as Record<string,number>).attempt));
    const candidates=history.filter(h=>h.attempt===latest);
    if(candidates.length!==1) return invalid();
    const submissionId=candidates[0].id;
    const currentPath=prefix+`/submissions/${submissionId}`;
    const readCurrent=async()=>{
      const payload=await this.request<unknown>(currentPath,init);
      if(!isObject(payload)||!Array.isArray(payload.quiz_submissions)||payload.quiz_submissions.length!==1) return invalid();
      return payload.quiz_submissions[0];
    };
    const current=await readCurrent();
    if(!isObject(current)||!positiveId(current.attempt)) return invalid();
    const questionsPath=prefix+"/questions";
    const readQuestions=async(query:string)=>{
      const all:unknown[]=[];const seen=new Set<string>();
      let url:string|null=this.baseUrl+questionsPath+query;
      for(let page=0;url && page<10;page++) {
        const parsed=new URL(url),base=new URL(this.baseUrl);
        if(parsed.origin!==base.origin||parsed.pathname!==questionsPath||parsed.username||parsed.password||seen.has(url)) return invalid();
        seen.add(url);
        const res=await this.requestRaw(url,init),body:unknown=await res.json();
        if(!Array.isArray(body)||all.length+body.length>100) return invalid();
        all.push(...body);
        const link=res.headers.get("link"),next=parseNextLink(link);
        if(link?.includes('rel="next"')&&!next) return invalid();
        url=next;
      }
      if(url) return invalid();
      return all;
    };
    const questions=await readQuestions("?per_page=100");
    const attemptQuestions=await readQuestions(`?per_page=100&quiz_submission_id=${submissionId}&quiz_submission_attempt=${current.attempt}`);
    const evidence={quiz,submission,current,questions,attemptQuestions};
    // A regrade or new attempt during these reads must not produce a green result.
    const after={...evidence,quiz:await this.request<unknown>(prefix,init),
      submission:await this.request<unknown>(submissionPath,init),current:await readCurrent()};
    if(evidenceSignature(evidence)!==evidenceSignature(after)) return invalid();
    return evidence;
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
    // **同期送信にする（2026-09-08）**。async は Canvas の裏の処理（delayed_job）に
    // 積まれるだけで、本番Canvasにその処理を担うコンテナが無いことが B15 の調査で
    // 判明した（開発者キーの変更がアプリへ配られなかった）。async のままだと
    // 週次レポート・AI講師停止の通知が「送信済み」なのに受信箱に届かない。
    // 宛先は講師数名なので同期でも十分軽い（手動対応リスト B21）
    params.set("mode", "sync");
    // **毎回新しい会話にする（2026-09-08）**。指定しないとCanvasは同じ相手との既存の
    // 会話に本文だけを追加し、件名は最初の会話のまま残る。週次レポートで
    // 「件名は 08-31 の週、本文は 09-07 の週」という食い違いが本番で出た
    params.set("force_new", "true");

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
