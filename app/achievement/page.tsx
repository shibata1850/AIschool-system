import {
  computeWeeklyAchievements,
  latestAchievement,
} from "@/lib/f4/achievement";
import { getCurrentStudentId } from "@/lib/auth";
import { getLessonRecords } from "@/lib/f3/store";

export const dynamic = "force-dynamic";

/**
 * S5 自分の到達度（docs/画面仕様書.md S5）。
 * 他人との比較は表示しない。下降時も否定的な表現を使わない。
 * 学習記録はストア経由で取得する（成績確定が反映される — F3→F4連携）。
 */
export default function AchievementPage() {
  const records = getLessonRecords(getCurrentStudentId());
  const weekly = computeWeeklyAchievements(records);
  const latest = latestAchievement(weekly);

  return (
    <main>
      <h1>じぶんの到達度（とうたつど）</h1>

      {latest ? (
        <section
          aria-label="今週の到達度"
          style={{
            border: "2px solid var(--accent)",
            borderRadius: 8,
            padding: "1rem",
            margin: "1rem 0",
          }}
        >
          <p style={{ fontSize: "1.5rem" }}>
            いまの到達度: <strong>{latest.total}</strong>
          </p>
        </section>
      ) : (
        <p>まだ記録がありません。はじめての授業のあとに表示されます。</p>
      )}

      <section aria-label="週ごとのきろく">
        <h2 style={{ fontSize: "1.2rem", marginBottom: "0.75rem" }}>
          週ごとのきろく
        </h2>
        <ul style={{ listStyle: "none" }}>
          {weekly.map((week) => (
            <li
              key={week.weekStart}
              aria-label={`${week.weekStart}の週`}
              style={{
                border: `2px solid ${week.measurable ? "var(--fg-sub)" : "#3a424b"}`,
                borderRadius: 8,
                padding: "0.75rem",
                margin: "0.5rem 0",
                color: week.measurable ? "var(--fg)" : "var(--fg-sub)",
              }}
            >
              <p style={{ fontWeight: "bold" }}>{week.weekStart} の週</p>
              {week.measurable ? (
                <p>
                  到達度 {week.total} ／ 出席率 {week.attendanceRate}% ／ 提出率{" "}
                  {week.submissionRate}%
                </p>
              ) : (
                <p>この週は記録がありません（計測不能）</p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
