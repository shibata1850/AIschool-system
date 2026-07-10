import { createCanvasClient } from "@/lib/canvas/client";
import { resolveGradebook } from "@/lib/canvas/gradebook";
import { GradeForm } from "./grade-form";

export const dynamic = "force-dynamic";

/**
 * 成績入力（Canvas連携・B-3）。講師・管理者のみ（proxy.ts の /teacher ガード）。
 * 実Canvasの受講生に点数をつけ、Canvasの成績表へ書き戻す。
 * 未接続時はデモモードの案内（インメモリのS7採点画面を使う旨）を表示する。
 */
export default async function GradePage() {
  const gb = await resolveGradebook(createCanvasClient());

  return (
    <main style={{ maxWidth: "48rem" }}>
      <h1>成績入力（Canvas連携）</h1>
      <p style={{ color: "var(--fg-sub)", marginBottom: "1rem" }}>
        受講生に点数をつけると、Canvasの成績表に反映されます。
      </p>

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
                  key={row.student.id}
                  userId={row.student.id}
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
