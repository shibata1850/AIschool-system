import {
  combineAchievement,
  computeWeeklyAchievements,
  isDeclining,
  latestAchievement,
} from "@/lib/f4/achievement";
import { getExternalMasteryForStudent } from "@/lib/integration/mastery";
import { getLessonRecords } from "@/lib/f3/store";
import { getRoster } from "@/lib/roster";
import { getLatestWeeklyReport } from "@/lib/f4/generateWeeklyReport";

export const dynamic = "force-dynamic";

/** 生成時刻を日本語の読みやすい形にする */
function formatJst(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * S8 週次到達度レポート（docs/画面仕様書.md S8）。
 * 毎週月曜7:00のバッチが生成・通知したスナップショット（要件定義書9.2 F4①）と、
 * 週の途中でも使える現在値の集計を並べて表示する。
 * 権限ガードは proxy.ts（講師・管理者のみ）。
 */
export default async function ReportPage() {
  const [snapshot, allRows] = await Promise.all([
    getLatestWeeklyReport(),
    Promise.all(
      (await getRoster()).map(async (student) => {
        const [records, homeStudy] = await Promise.all([
          getLessonRecords(student.id),
          getExternalMasteryForStudent(student.id),
        ]);
        const weekly = computeWeeklyAchievements(records);
        const latest = latestAchievement(weekly);
        const declining = isDeclining(weekly);
        // 到達度はS5と同じ合成値を出す（画面ごとに違う数字が出ると講師が混乱する）。
        // 出席率・提出率は教室の実績なので合成しない
        const combined = latest
          ? combineAchievement(
              latest.total,
              homeStudy.map((m) => m.score),
            )
          : null;
        return { student, weekly, latest, declining, combined };
      }),
    ),
  ]);
  const rows = allRows.filter((row) => row.weekly.length > 0);

  return (
    <main style={{ maxWidth: "64rem" }}>
      <h1>週次到達度レポート</h1>

      <section
        aria-label="自動生成レポート"
        style={{
          border: "2px solid var(--fg-sub)",
          borderRadius: 8,
          padding: "1rem",
          margin: "1rem 0 1.5rem",
        }}
      >
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
          自動生成レポート（毎週月曜7:00）
        </h2>

        {snapshot === null ? (
          <p aria-label="未生成" style={{ color: "var(--warn)" }}>
            まだ生成されていません。月曜7:00のバッチが動くと、ここに結果が表示されます。
          </p>
        ) : (
          <>
            <p aria-label="生成状況">
              対象週 <strong>{snapshot.report.weekStart}</strong> ／ 生成{" "}
              {formatJst(snapshot.generatedAt)}
            </p>
            <p aria-label="通知状況" style={{ color: "var(--fg-sub)" }}>
              {snapshot.notifiedAt
                ? `講師へ通知済み（${formatJst(snapshot.notifiedAt)}）`
                : `未通知: ${snapshot.notifySkippedReason ?? "理由不明"}`}
            </p>
            <p style={{ marginTop: "0.5rem" }}>
              対象 {snapshot.report.summary.studentCount}名 ／ 停滞アラート{" "}
              {snapshot.report.alerts.length}名 ／ 未提出課題あり{" "}
              {snapshot.report.summary.withPendingCount}名
            </p>

            {snapshot.report.alerts.length > 0 && (
              <div aria-label="停滞アラート" style={{ marginTop: "0.75rem" }}>
                <h3 style={{ fontSize: "1rem", color: "var(--warn)" }}>
                  停滞アラート（2週連続で到達度が下降）
                </h3>
                <ul style={{ paddingLeft: "1.2rem" }}>
                  {snapshot.report.alerts.map((a) => (
                    <li key={a.studentId}>
                      座席{a.seatNo} {a.displayName}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {snapshot.report.summary.withPendingCount > 0 && (
              <div aria-label="未提出課題一覧" style={{ marginTop: "0.75rem" }}>
                <h3 style={{ fontSize: "1rem" }}>未提出の課題</h3>
                <ul style={{ paddingLeft: "1.2rem" }}>
                  {snapshot.report.rows
                    .filter((r) => r.pendingAssignments.length > 0)
                    .map((r) => (
                      <li key={r.studentId}>
                        座席{r.seatNo} {r.displayName}: {r.pendingAssignments.join("、")}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      <h2 style={{ fontSize: "1.1rem" }}>現在の集計（リアルタイム）</h2>
      <p style={{ color: "var(--fg-sub)", marginBottom: "1rem" }}>
        週の途中の状況です。手作業での集計は不要です。
        到達度は<strong>教室での学習8割＋自宅学習2割</strong>を合成した値で、
        受講生本人の画面（S5）と同じ数字です。出席率・提出率は教室の実績のみを示します。
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
          {rows.map(({ student, latest, declining, combined }) => (
            <tr key={student.id}>
              <td style={{ padding: "0.6rem" }}>{student.seatNo}</td>
              <td style={{ padding: "0.6rem" }}>{student.displayName}</td>
              <td style={{ padding: "0.6rem" }}>
                {combined ? <strong>{combined.total}</strong> : "計測不能"}
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
