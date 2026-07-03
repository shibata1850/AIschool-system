import {
  computeWeeklyAchievements,
  isDeclining,
  latestAchievement,
} from "@/lib/f4/achievement";
import { getLessonRecords } from "@/lib/f3/store";
import { STUDENTS } from "@/lib/f4/fixtures";

export const dynamic = "force-dynamic";

/**
 * S8 週次到達度レポート（docs/画面仕様書.md S8）。
 * 本番は毎週月曜7:00にバッチ生成して通知する（KPI#2: 手集計0時間）。
 * 参照実装では表示時に同じ集計ロジックで生成する。
 * 権限ガードは proxy.ts（講師・管理者のみ）。
 */
export default function ReportPage() {
  const rows = STUDENTS.map((student) => {
    const records = getLessonRecords(student.id);
    const weekly = computeWeeklyAchievements(records);
    const latest = latestAchievement(weekly);
    const declining = isDeclining(weekly);
    return { student, weekly, latest, declining };
  }).filter((row) => row.weekly.length > 0);

  return (
    <main style={{ maxWidth: "64rem" }}>
      <h1>週次到達度レポート</h1>
      <p style={{ color: "var(--fg-sub)", marginBottom: "1rem" }}>
        毎週月曜7:00に自動生成されます（手作業での集計は不要です）。
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["座席", "表示名", "到達度（最新）", "出席率", "提出率", "アラート"].map(
              (h) => (
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
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ student, latest, declining }) => (
            <tr key={student.id}>
              <td style={{ padding: "0.6rem" }}>{student.seatNo}</td>
              <td style={{ padding: "0.6rem" }}>{student.displayName}</td>
              <td style={{ padding: "0.6rem" }}>
                {latest ? <strong>{latest.total}</strong> : "計測不能"}
              </td>
              <td style={{ padding: "0.6rem" }}>
                {latest ? `${latest.attendanceRate}%` : "—"}
              </td>
              <td style={{ padding: "0.6rem" }}>
                {latest ? `${latest.submissionRate}%` : "—"}
              </td>
              <td style={{ padding: "0.6rem", color: "var(--warn)" }}>
                {declining ? "停滞（2週連続下降）" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
