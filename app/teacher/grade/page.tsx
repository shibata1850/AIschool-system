import { createCanvasClient } from "@/lib/canvas/client";
import { resolveScopedGradebook, type Gradebook } from "@/lib/canvas/gradebook";
import { toErrorMessage } from "@/lib/canvas/errorMessage";
import { getCurrentUser } from "@/lib/auth";
import { teacherCourseAccess } from "@/lib/course/access";
import { notFound } from "next/navigation";
import { GradeForm } from "./grade-form";

export const dynamic = "force-dynamic";

/**
 * 成績入力（Canvas連携・B-3）。講師・管理者のみ（proxy.ts の /teacher ガード）。
 * 実Canvasの受講生に点数をつけ、Canvasの成績表へ書き戻す。
 * 未接続時はデモモードの案内（インメモリのS7採点画面を使う旨）を表示する。
 */
export default async function GradePage({ searchParams }: {
  searchParams: Promise<{ assignmentId?: string | string[] }>;
}) {
  const access = teacherCourseAccess(await getCurrentUser());
  if (!access) notFound();
  const client = createCanvasClient();
  const query = (await searchParams).assignmentId;
  const selectedId = typeof query === "string" && /^[1-9][0-9]*$/.test(query) && Number.isSafeInteger(Number(query))
    ? Number(query) : undefined;
  let assignments: { id: number; name: string }[] = [];
  let gb: Gradebook | { state: "selectAssignment" } = { state: "notConfigured" };
  if (client) {
    if (!access.courseId) {
      gb = { state: "error", message: "Canvasのコースから講師として起動してください" };
    } else {
      try {
        const course = await client.getCourseByLtiContext(access.courseId);
        assignments = (await client.listAssignments(course.id)).filter(item => item.published);
        if (query !== undefined && (!selectedId || !assignments.some(item => item.id === selectedId))) {
          gb = { state: "error", message: "このコースの公開中の課題を選択してください" };
        } else if (selectedId) {
          gb = await resolveScopedGradebook(client, access.courseId, selectedId);
        } else {
          gb = { state: assignments.length ? "selectAssignment" : "noAssignment" };
        }
      } catch (error) {
        gb = { state: "error", message: toErrorMessage(error) };
      }
    }
  }

  return (
    <main style={{ maxWidth: "48rem" }}>
      <h1>成績入力（Canvas連携）</h1>
      {assignments.length > 0 && (
        <form method="get" action="/teacher/grade" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "end", marginBottom: "1rem" }}>
          <label style={{ display: "grid", gap: "0.5rem", minWidth: 0, maxWidth: "100%", flex: "1 1 16rem" }}>
            採点する課題
            <select name="assignmentId" required defaultValue={selectedId ?? ""} style={{ width: "100%", minWidth: 0, minHeight: "44px", fontSize: "1rem" }}>
              <option value="">課題を選択</option>
              {assignments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <button type="submit" style={{ minHeight: "44px", padding: "0 1rem" }}>表示</button>
        </form>
      )}

      {gb.state === "notConfigured" && (
        <p style={{ padding: "1rem", border: "1px solid var(--fg-sub)", borderRadius: "0.5rem" }}>
          いまはデモモードです（Canvas未接続）。Canvasに接続すると、実際の成績表へ反映できます。
        </p>
      )}
      {gb.state === "empty" && (
        <p style={{ color: "var(--fg-sub)" }}>Canvasにコースがまだありません。</p>
      )}
      {gb.state === "noAssignment" && (
        <p style={{ color: "var(--fg-sub)" }}>このコースに公開中の課題がありません。</p>
      )}
      {gb.state === "error" && (
        <p role="status" style={{ padding: "1rem", border: "2px solid #d33", borderRadius: "0.5rem" }}>
          Canvasから取得できませんでした。{gb.message}
        </p>
      )}

      {gb.state === "ok" && (
        <>
          <p>
            コース: <strong>{gb.course.name}</strong> ／ 課題:{" "}
            <strong>{gb.assignment.title}</strong>
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
            {gb.rows.length === 0 ? (
              <p style={{ color: "var(--fg-sub)" }}>受講生が登録されていません。</p>
            ) : (
              gb.rows.map((row) => (
                <GradeForm
                  key={`${gb.assignment.id}:${row.student.id}`}
                  userId={row.student.id}
                  assignmentId={gb.assignment.id}
                  studentName={row.student.name}
                  initialScore={row.score}
                />
              ))
            )}
          </div>
        </>
      )}
    </main>
  );
}
