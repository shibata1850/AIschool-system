import {
  CanvasApiError,
  type CanvasAssignment,
  type CanvasClient,
  type CanvasCourse,
  type CanvasUser,
} from "./client";
import type { Assignment } from "@/lib/f3/types";

/**
 * Canvasのコース1件分の連携データ（講師クラス画面・F3の出題元）。
 * 例外は投げず、状態オブジェクトで返す（画面は分岐して表示するだけ）。
 */
export type CourseData =
  | { state: "notConfigured" }
  | { state: "empty" } // 接続はできたがコースが無い
  | { state: "error"; message: string }
  | {
      state: "ok";
      course: CanvasCourse;
      students: CanvasUser[];
      assignments: Assignment[];
    };

/** CanvasのHTML説明文を、生徒向け画面に載せる素のテキストへ最小整形する */
export function stripHtml(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Canvas課題 → カスタム層のドメイン課題へ変換（プロンプト演習=Canvas課題の対応） */
export function toDomainAssignment(a: CanvasAssignment): Assignment {
  return {
    id: String(a.id),
    title: a.name,
    description: stripHtml(a.description),
    // Canvasに文字数上限の概念はないため既定値を用いる（F3の仕様値）
    charLimit: 4000,
    // 期限未設定のCanvas課題は遠い将来にして「期限なし」相当に扱う
    deadline: a.due_at ?? "2099-12-31T23:59:00+09:00",
  };
}

/**
 * 連携対象のコース1件を解決し、名簿と課題（公開済みのみ）をまとめて返す。
 * 複数コースがある場合は先頭を対象とする（本番は授業コマから解決する）。
 */
export async function resolveCourseData(client: CanvasClient | null): Promise<CourseData> {
  if (!client) return { state: "notConfigured" };
  try {
    const courses = await client.listCourses();
    if (courses.length === 0) return { state: "empty" };
    const course = courses[0];
    const [students, rawAssignments] = await Promise.all([
      client.listStudents(course.id),
      client.listAssignments(course.id),
    ]);
    const assignments = rawAssignments
      .filter((a) => a.published)
      .map(toDomainAssignment);
    return { state: "ok", course, students, assignments };
  } catch (e) {
    const message =
      e instanceof CanvasApiError
        ? e.status === 401
          ? "認証に失敗しました。アクセストークンを確認してください。"
          : `Canvasからの取得に失敗しました（HTTP ${e.status}）。`
        : "Canvasからの取得中に想定外のエラーが発生しました。";
    return { state: "error", message };
  }
}
