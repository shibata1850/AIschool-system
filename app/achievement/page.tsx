import {
  computeWeeklyAchievements,
  latestAchievement,
} from "@/lib/f4/achievement";
import { getCurrentUser } from "@/lib/auth";
import { getLessonRecords } from "@/lib/f3/store";
import { getExternalMasteryForStudent } from "@/lib/integration/mastery";

export const dynamic = "force-dynamic";

/**
 * S5 自分の到達度（docs/画面仕様書.md S5）。
 * 他人との比較は表示しない。下降時も否定的な表現を使わない。
 * 学習記録はストア経由で取得する（成績確定が反映される — F3→F4連携）。
 */
export default async function AchievementPage() {
  const { userId } = await getCurrentUser();
  const records = await getLessonRecords(userId);
  const weekly = computeWeeklyAchievements(records);
  const latest = latestAchievement(weekly);
  // 自宅学習の到達度（eラーニングから受信・E7-c）。**教室の到達度とは合成しない**
  const homeStudy = await getExternalMasteryForStudent(userId);

  return (
    <main>
      <h1>自分の到達度</h1>

      {latest ? (
        <section
          aria-label="今週の到達度（教室）"
          style={{
            border: "2px solid var(--accent)",
            borderRadius: 8,
            padding: "1rem",
            margin: "1rem 0",
          }}
        >
          <p style={{ fontSize: "1.5rem" }}>
            教室の到達度: <strong>{latest.total}</strong>
          </p>
        </section>
      ) : (
        <p>まだ記録がありません。はじめての授業のあとに表示されます。</p>
      )}

      <section aria-label="週ごとの記録（教室）">
        <h2 style={{ fontSize: "1.2rem", marginBottom: "0.75rem" }}>
          週ごとの記録（教室）
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

      {homeStudy.length > 0 && (
        <section aria-label="自宅学習の到達度" style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "0.25rem" }}>
            自宅学習の到達度
          </h2>
          {/*
            教室の到達度とは別の指標として並べる（合成しない）。
            尺度も期間も違うため、混ぜると数字の意味が説明できなくなる。
          */}
          <p className="muted" style={{ marginBottom: "0.75rem" }}>
            eラーニングでの学習から、単元ごとに算出された値です。教室の到達度とは
            別の指標のため、合算していません。
          </p>
          <ul style={{ listStyle: "none" }}>
            {homeStudy.map((m) => (
              <li
                key={`${m.source}-${m.unitId}`}
                aria-label={`${m.unitTitle ?? m.unitId}の自宅学習到達度`}
                style={{
                  border: "2px solid var(--fg-sub)",
                  borderRadius: 8,
                  padding: "0.75rem",
                  margin: "0.5rem 0",
                }}
              >
                <p style={{ fontWeight: "bold" }}>{m.unitTitle ?? m.unitId}</p>
                {m.score === null ? (
                  // データ不足は「測定中」。0点として見せない（先方要件定義書 E4 例外1）
                  <p className="muted">測定中（学習の記録がたまると表示されます）</p>
                ) : (
                  <p>到達度 {m.score}</p>
                )}
                {m.reasons && m.reasons.length > 0 && (
                  // 算出根拠を本人が確認できること（先方 受け入れ基準 B-3）
                  <ul style={{ marginTop: "0.5rem", paddingLeft: "1.2rem" }}>
                    {m.reasons.map((reason, i) => (
                      <li key={i} className="muted">
                        {reason}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
