import { getStore } from "@/lib/f3/store";
import { STATUS_LABELS, type ExerciseStatus } from "@/lib/f3/types";
import { isAttendedWithoutSubmission, STUDENTS } from "@/lib/f4/fixtures";

export const dynamic = "force-dynamic";

/**
 * S6 授業中モニタリング（docs/画面仕様書.md S6）。
 * 教室（NearHub）に投影されるため、成績値は表示しない — 状態色とバッジのみ。
 * 座席配置と同じ4×4格子。権限ガードは proxy.ts（講師・管理者のみ）。
 */

const STATUS_COLORS: Record<ExerciseStatus, string> = {
  not_started: "#5a646e", // 灰
  in_progress: "#3178c6", // 青
  submitted: "#2e8b57", // 緑
  ai_graded: "#2e8b57", // 緑（提出済み扱い）
  completed: "#2e8b57",
  returned: "#c77f1a", // 橙
};

export default async function MonitorPage() {
  const store = getStore();

  return (
    <main style={{ maxWidth: "64rem" }}>
      <h1>授業中モニタリング</h1>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "0.75rem",
        }}
      >
        {STUDENTS.map((student) => {
          const submission = [...store.submissions.values()].find(
            (s) => s.studentId === student.id,
          );
          const status: ExerciseStatus = submission?.status ?? "not_started";
          const attendedNoSubmit = isAttendedWithoutSubmission(student.id);
          return (
            <section
              key={student.id}
              aria-label={`座席${student.seatNo} ${student.displayName}`}
              style={{
                border: `3px solid ${STATUS_COLORS[status]}`,
                borderRadius: 8,
                padding: "0.75rem",
                minHeight: 88, // タップターゲット確保（NearHub制約）
                background: "var(--bg-panel)",
              }}
            >
              <p style={{ fontWeight: "bold" }}>
                {student.seatNo}. {student.displayName}
              </p>
              <p style={{ color: STATUS_COLORS[status] }}>{STATUS_LABELS[status]}</p>
              {attendedNoSubmit && (
                <p style={{ color: "var(--warn)" }}>出席・未提出</p>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
