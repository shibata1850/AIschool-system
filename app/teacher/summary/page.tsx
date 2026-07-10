import { createCanvasClient } from "@/lib/canvas/client";
import { resolveClassSummary } from "@/lib/canvas/classSummary";

export const dynamic = "force-dynamic";

/**
 * クラス成績サマリ（Canvas成績ベース・B-4）。講師・管理者のみ（proxy.ts /teacher）。
 * Canvasの提出・点数から受講生ごとの提出率・平均点を集計して表示する。
 * 出席込みの到達度（S5/S8のF4式）はカスタム層側に残す（未決#11の出席管理が前提）。
 */
export default async function ClassSummaryPage() {
  const summary = await resolveClassSummary(createCanvasClient());

  return (
    <main style={{ maxWidth: "52rem" }}>
      <h1>クラス成績サマリ（Canvas）</h1>
      <p style={{ color: "var(--fg-sub)", marginBottom: "1rem" }}>
        Canvasに記録された提出と点数から、受講生ごとの提出状況と平均点をまとめています。
        （出席をふくめた到達度は別画面です）
      </p>

      {summary.state === "notConfigured" && (
        <p style={{ padding: "1rem", border: "1px solid var(--fg-sub)", borderRadius: "0.5rem" }}>
          いまはデモモードです（Canvas未接続）。接続すると実際の成績サマリが表示されます。
        </p>
      )}
      {summary.state === "empty" && (
        <p style={{ color: "var(--fg-sub)" }}>Canvasにコースがまだありません。</p>
      )}
      {summary.state === "noAssignment" && (
        <p style={{ color: "var(--fg-sub)" }}>このコースに公開中の課題がありません。</p>
      )}
      {summary.state === "error" && (
        <p role="status" style={{ padding: "1rem", border: "2px solid #d33", borderRadius: "0.5rem" }}>
          Canvasから取得できませんでした。{summary.message}
        </p>
      )}

      {summary.state === "ok" && (
        <>
          <p>
            コース: <strong>{summary.course.name}</strong> ／ 公開課題:{" "}
            {summary.totalAssignments}件
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
            <thead>
              <tr>
                {["受講生", "提出", "採点済み", "平均点"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "0.6rem",
                      borderBottom: "2px solid var(--fg-sub)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row) => (
                <tr key={row.student.id}>
                  <td style={{ padding: "0.6rem" }}>{row.student.name}</td>
                  <td style={{ padding: "0.6rem" }}>
                    {row.submittedCount} / {row.totalAssignments}
                  </td>
                  <td style={{ padding: "0.6rem" }}>
                    {row.gradedCount} / {row.totalAssignments}
                  </td>
                  <td style={{ padding: "0.6rem" }}>
                    {row.averageScore === null ? "—" : `${row.averageScore}点`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
