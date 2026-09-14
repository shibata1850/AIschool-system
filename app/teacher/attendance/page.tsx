import { CURRENT_LESSON_WEEK, getAttendance } from "@/lib/f3/store";
import { getRoster, listRecordedCourseIds } from "@/lib/roster";
import { getCurrentUser } from "@/lib/auth";
import { canReadAllCourses } from "@/lib/course/access";
import { staffCourseSelection } from "@/lib/course/staffSelection";
import { CourseSelector } from "../course-selector";
import { notFound } from "next/navigation";
import { AttendanceRow } from "./attendance-row";

export const dynamic = "force-dynamic";

/**
 * 出席記録（未決#11: 出席はカスタム層で管理）。講師・管理者のみ（proxy.ts /teacher）。
 * 当該コマの週について、受講生ごとに出席/欠席を記録する。到達度（F4）の出席率に反映される。
 */
export default async function AttendancePage({ searchParams }: { searchParams?: Promise<{ course?: string | string[] }> }) {
  const actor = await getCurrentUser();
  if (!canReadAllCourses(actor)) notFound();
  const access = staffCourseSelection(actor, await listRecordedCourseIds(), (await searchParams)?.course);
  if (!access) notFound();
  const rows = await Promise.all(
    (await getRoster(access.courseId)).map(async (s) => ({
      student: s,
      initial: await getAttendance(s.id, CURRENT_LESSON_WEEK, access.courseId),
    })),
  );

  return (
    <main style={{ maxWidth: "42rem" }}>
      <h1>出席の記録</h1>
      <CourseSelector courses={access.courses} courseId={access.courseId} />
      {!access.canEdit && <p className="muted">閲覧のみ（起動元コース外の記録）</p>}
      <p className="lead">
        対象週: {CURRENT_LESSON_WEEK}
      </p>
      <div>
        {rows.map(({ student: s, initial }) => (
          access.canEdit ? <AttendanceRow
            key={s.id}
            studentId={s.id}
            displayName={s.displayName}
            seatNo={s.seatNo}
            weekStart={CURRENT_LESSON_WEEK}
            initial={initial}
          /> : <p key={s.id}>{s.seatNo}. {s.displayName} ／ {initial === true ? "出席" : initial === false ? "欠席" : "未記録"}</p>
        ))}
      </div>
    </main>
  );
}
