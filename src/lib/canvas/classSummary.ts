import {
  CanvasApiError,
  type CanvasClient,
  type CanvasCourse,
  type CanvasUser,
} from "./client";

/**
 * 受講生ごとのCanvas成績サマリ（B-4）。
 * 出席はCanvasコアに無い（未決事項#11でカスタム層管理）ため、ここでは
 * Canvasにある「提出」と「点数」のみを集計する。出席込みの到達度式（F4）は
 * カスタム層側（src/lib/f4）に残す。
 */
export interface StudentSummary {
  student: CanvasUser;
  totalAssignments: number;
  /** 提出済み課題数（submitted_at あり） */
  submittedCount: number;
  /** 採点済み課題数（score あり） */
  gradedCount: number;
  /** 採点済みの平均点（四捨五入・整数）。未採点は null */
  averageScore: number | null;
}

export type ClassSummary =
  | { state: "notConfigured" }
  | { state: "empty" }
  | { state: "noAssignment" }
  | { state: "error"; message: string }
  | {
      state: "ok";
      course: CanvasCourse;
      totalAssignments: number;
      rows: StudentSummary[];
    };

function toErrorMessage(e: unknown): string {
  return e instanceof CanvasApiError
    ? e.status === 401
      ? "認証に失敗しました。アクセストークンを確認してください。"
      : `Canvasとの通信に失敗しました（HTTP ${e.status}）。`
    : "Canvasとの通信中に想定外のエラーが発生しました。";
}

/**
 * 連携対象コースの公開課題すべてについて提出を集め、受講生ごとに集計する。
 */
export async function resolveClassSummary(client: CanvasClient | null): Promise<ClassSummary> {
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

    // 課題ごとの提出一覧を取得（受講生×課題で突合するため）
    const submissionsByAssignment = await Promise.all(
      published.map((a) => client.listSubmissions(course.id, a.id)),
    );

    const rows: StudentSummary[] = students.map((student) => {
      let submittedCount = 0;
      let gradedCount = 0;
      let scoreSum = 0;
      for (const submissions of submissionsByAssignment) {
        const sub = submissions.find((s) => s.user_id === student.id);
        if (!sub) continue;
        if (sub.submitted_at) submittedCount += 1;
        if (sub.score !== null) {
          gradedCount += 1;
          scoreSum += sub.score;
        }
      }
      return {
        student,
        totalAssignments: published.length,
        submittedCount,
        gradedCount,
        averageScore: gradedCount > 0 ? Math.round(scoreSum / gradedCount) : null,
      };
    });

    return { state: "ok", course, totalAssignments: published.length, rows };
  } catch (e) {
    return { state: "error", message: toErrorMessage(e) };
  }
}
