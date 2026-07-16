import { CURRENT_LESSON_WEEK, getAttendance } from "@/lib/f3/store";
import { STUDENTS } from "@/lib/f4/fixtures";
import { AttendanceRow } from "./attendance-row";

export const dynamic = "force-dynamic";

/**
 * 出席記録（未決#11: 出席はカスタム層で管理）。講師・管理者のみ（proxy.ts /teacher）。
 * 当該コマの週について、受講生ごとに出席/欠席を記録する。到達度（F4）の出席率に反映される。
 */
export default function AttendancePage() {
  return (
    <main style={{ maxWidth: "42rem" }}>
      <h1>出席の記録</h1>
      <p className="lead">
        この授業（{CURRENT_LESSON_WEEK} の週）の出席をつけます。到達度の出席率に反映されます。
      </p>
      <div>
        {STUDENTS.map((s) => (
          <AttendanceRow
            key={s.id}
            studentId={s.id}
            displayName={s.displayName}
            seatNo={s.seatNo}
            weekStart={CURRENT_LESSON_WEEK}
            initial={getAttendance(s.id, CURRENT_LESSON_WEEK)}
          />
        ))}
      </div>
    </main>
  );
}
