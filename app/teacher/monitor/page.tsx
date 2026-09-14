import { getStaffMonitor } from "@/lib/f3/staffMonitor";
import { STATUS_LABELS, type ExerciseStatus } from "@/lib/f3/types";
import { getCurrentUser } from "@/lib/auth";
import { canReadAllCourses } from "@/lib/course/access";
import { notFound } from "next/navigation";
import { MessageBox } from "./message-box";
import { OutageBanner } from "./outage-banner";

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
  const actor = await getCurrentUser();
  if (!canReadAllCourses(actor)) notFound();
  const tiles = await getStaffMonitor(actor);

  return (
    <main style={{ maxWidth: "64rem" }}>
      <h1>授業中モニタリング</h1>
      <OutageBanner />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 14rem), 1fr))",
          gap: "0.75rem",
        }}
      >
        {tiles.map(({ student, states, canMessage }) => {
          return (
            <section
              key={student.id}
              aria-label={`座席${student.seatNo} ${student.displayName}`}
              style={{
                border: `3px solid ${states.length === 1 ? STATUS_COLORS[states[0].status] : "var(--fg-sub)"}`,
                borderRadius: 8,
                padding: "0.75rem",
                minHeight: 88, // タップターゲット確保（NearHub制約）
                background: "var(--bg-panel)",
                minWidth: 0,
                overflowWrap: "anywhere",
              }}
            >
              <p style={{ fontWeight: "bold" }}>
                {student.seatNo}. {student.displayName}
              </p>
              {states.map(({ courseId, status, attendedNoSubmit }) => <div key={courseId ?? "legacy"}>
                <p className="muted">{courseId === null ? "コース未設定" : courseId === actor.courseId ? "起動元コース" : `コース ${courseId}`}</p>
                <p style={{ color: STATUS_COLORS[status] }}>{STATUS_LABELS[status]}</p>
                {attendedNoSubmit && (
                <p style={{ color: "var(--warn)" }}>出席・未提出</p>
                )}
              </div>)}
              {/*
                成績値は投影されるため出さない方針は維持する（画面仕様書S6）。
                ここに置くのは「送る」導線だけで、送った本文もタイルには出さない。
              */}
              {canMessage ? <MessageBox studentId={student.id} displayName={student.displayName} />
                : <p className="muted">閲覧のみ（起動元コース外の受講生）</p>}
            </section>
          );
        })}
      </div>
    </main>
  );
}
