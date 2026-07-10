import {
  CanvasApiError,
  type CanvasClient,
  type CanvasCourse,
  type CanvasUser,
} from "./client";

/** 成績表の1行（受講生＋現在のCanvas成績） */
export interface GradebookRow {
  student: CanvasUser;
  /** Canvasに記録済みの点数（未採点は null） */
  score: number | null;
  /** 提出状態（submitted/graded/unsubmitted 等） */
  workflowState: string;
}

/**
 * 講師採点（B-3）の表示データ。例外は投げず状態で返す。
 * - noAssignment: コースはあるが公開課題がない
 */
export type Gradebook =
  | { state: "notConfigured" }
  | { state: "empty" }
  | { state: "noAssignment" }
  | { state: "error"; message: string }
  | {
      state: "ok";
      course: CanvasCourse;
      assignment: { id: number; title: string };
      rows: GradebookRow[];
    };

function toErrorMessage(e: unknown): string {
  return e instanceof CanvasApiError
    ? e.status === 401
      ? "認証に失敗しました。アクセストークンを確認してください。"
      : `Canvasとの通信に失敗しました（HTTP ${e.status}）。`
    : "Canvasとの通信中に想定外のエラーが発生しました。";
}

/**
 * 連携対象コースの先頭公開課題について、受講生ごとの現在の成績を集める。
 */
export async function resolveGradebook(client: CanvasClient | null): Promise<Gradebook> {
  if (!client) return { state: "notConfigured" };
  try {
    const courses = await client.listCourses();
    if (courses.length === 0) return { state: "empty" };
    const course = courses[0];
    const [students, assignments] = await Promise.all([
      client.listStudents(course.id),
      client.listAssignments(course.id),
    ]);
    const published = assignments.filter((a) => a.published);
    if (published.length === 0) return { state: "noAssignment" };
    const assignment = published[0];

    const submissions = await client.listSubmissions(course.id, assignment.id);
    const byUser = new Map(submissions.map((s) => [s.user_id, s]));
    const rows: GradebookRow[] = students.map((student) => {
      const sub = byUser.get(student.id);
      return {
        student,
        score: sub?.score ?? null,
        workflowState: sub?.workflow_state ?? "unsubmitted",
      };
    });
    return { state: "ok", course, assignment: { id: assignment.id, title: assignment.name }, rows };
  } catch (e) {
    return { state: "error", message: toErrorMessage(e) };
  }
}

export type ParseScoreResult =
  | { ok: true; score: number }
  | { ok: false; message: string };

/**
 * 講師が入力した点数を検証する（0〜100の整数）。
 * 画面・APIの両方から使う純粋関数（挙動ドリフト防止）。
 */
export function parseScore(raw: unknown): ParseScoreResult {
  if (typeof raw !== "number" || Number.isNaN(raw)) {
    return { ok: false, message: "点数は数値で入力してください" };
  }
  if (!Number.isInteger(raw)) {
    return { ok: false, message: "点数は整数で入力してください" };
  }
  if (raw < 0 || raw > 100) {
    return { ok: false, message: "点数は0〜100で入力してください" };
  }
  return { ok: true, score: raw };
}
