import {
  combineAchievement,
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
  // 自宅学習の到達度（eラーニングから受信・E7-c）を教室の到達度と**合成して1つにする**
  // （2026-09-02 柴田さま「到達度は一つに絞る」）。内訳は下に必ず出す（先方 受け入れ基準B-3）
  const homeStudy = await getExternalMasteryForStudent(userId);
  const combined = latest
    ? combineAchievement(
        latest.total,
        homeStudy.map((m) => m.score),
      )
    : null;

  return (
    <main>
      <h1>自分の到達度</h1>

      {combined ? (
        <section
          aria-label="今の到達度"
          style={{
            border: "2px solid var(--accent)",
            borderRadius: 8,
            padding: "1rem",
            margin: "1rem 0",
          }}
        >
          <p style={{ fontSize: "1.5rem" }}>
            到達度: <strong>{combined.total}</strong>
          </p>
          {/*
            合成した数字は、内訳を出さないと意味が説明できなくなる。
            算出根拠を本人が確認できることは先方の受け入れ基準B-3の要件でもある。
          */}
          <p className="muted">
            内訳: 教室での学習 {combined.classroomTotal}
            {combined.homeStudyTotal !== null ? (
              <> ／ 自宅学習 {combined.homeStudyTotal}（{combined.measuredUnitCount}単元）</>
            ) : (
              <> ／ 自宅学習はまだ記録がありません（この分は教室の学習で計算しています）</>
            )}
          </p>
        </section>
      ) : (
        <p>まだ記録がありません。はじめての授業のあとに表示されます。</p>
      )}

      {/*
        週ごとの推移は教室の学習のみで出す。自宅学習は単元ごとの値で「週」の概念が
        無く、あとから届いた値を過去の週へ混ぜると履歴の数字が動いてしまうため
        （停滞アラートの判定も壊れる）。合成するのは上の「今の到達度」1つだけ。
      */}
      <section aria-label="週ごとの記録（教室）">
        <h2 style={{ fontSize: "1.2rem", marginBottom: "0.75rem" }}>
          週ごとの記録（教室）
        </h2>
        <p className="muted" style={{ marginBottom: "0.75rem" }}>
          こちらは教室での学習の推移です（自宅学習は単元ごとの記録のため、
          週の推移には含めていません）。
        </p>
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
        <section aria-label="自宅学習の内訳" style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "0.25rem" }}>
            自宅学習の内訳
          </h2>
          {/*
            上の「到達度」に合成済みの中身。単元ごとの値と算出根拠を出すことで、
            合成後の1つの数字がどこから来たのかを本人が追える（先方 受け入れ基準B-3）。
          */}
          <p className="muted" style={{ marginBottom: "0.75rem" }}>
            eラーニングでの学習から、単元ごとに算出された値です。上の到達度には、
            この平均が2割の重みで入っています。
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
