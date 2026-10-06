import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canReadAllCourses, courseAccess } from "@/lib/course/access";
import { readTrainingSettings } from "@/lib/course/trainingStore";
import { parseTrainingSettings } from "@/lib/course/trainingPolicy";
import { trainingLinkPolicy } from "@/lib/course/trainingLinks";
import { listDevelopment } from "@/lib/development/store";
import { attendanceLabels, helpLabels, workLabels, projectUrl } from "@/lib/development/policy";
import { AttendanceForm, ResolveButton, RefreshButton } from "../../development/forms";
import { ProjectQr } from "../../development/project-qr";
import "../../development/style.css";
export const dynamic = "force-dynamic";
function time(value: Date | undefined) { return value ? value.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "未更新"; }
export default async function DevelopmentTeacher({ searchParams }: { searchParams: Promise<{ course?: string; day?: string; student?: string }> }) {
  const actor = await getCurrentUser();
  if (!actor.viaLti || !canReadAllCourses(actor)) notFound();
  const query = await searchParams;
  const courseId = query.course ?? courseAccess(actor)?.courseId;
  if (!courseId) notFound();
  const settings = parseTrainingSettings(await readTrainingSettings(actor, courseId), courseId, trainingLinkPolicy(courseId));
  if (settings?.mode !== "development") notFound();
  const day = query.day === undefined ? settings.currentDay : Number(query.day);
  if (day !== null && !settings.days.some(d => d.day === day)) notFound();
  const rows = await listDevelopment(actor, courseId, day);
  const editable = courseAccess(actor)?.courseId === courseId;
  const detail = query.student ? rows.find(row => row.studentId === query.student) : null;
  if (query.student && !detail) notFound();
  const params = new URLSearchParams({ course: courseId, ...(day === null ? {} : { day: String(day) }) });
  return <main className="development">
    <Link href="/development">コースホーム</Link><h1>受講状況・出席</h1>
    <form><input type="hidden" name="course" value={courseId} /><label>授業回 <select name="day" defaultValue={day ?? ""} required>
      <option value="" disabled>未選択</option>{settings.days.map(d => <option key={d.day} value={d.day}>第{d.day}回：{d.title}</option>)}
    </select></label><button type="submit">表示</button></form>
    <RefreshButton auto={!detail} />
    {!editable && <p>閲覧のみ</p>}
    {detail ? <section>
      <Link href={`/teacher/development?${params}`}>一覧へ</Link><h2>{detail.displayName}</h2>
      <h3>システム名</h3><p>{detail.project?.name || "未登録"}</p>
      <h3>解決したい困りごと</h3><p className="development-detail">{detail.project?.problem || "未登録"}</p>
      <div className="actions">{projectUrl(detail.project?.editorUrl ?? null) && <a href={detail.project!.editorUrl!} target="_blank" rel="noopener noreferrer">編集画面を開く</a>}
        {projectUrl(detail.project?.previewUrl ?? null) && <a href={detail.project!.previewUrl!} target="_blank" rel="noopener noreferrer">利用・確認画面を開く</a>}</div>
      <ProjectQr url={detail.project?.previewUrl ?? null} />
      <h3>今困っている点</h3><p className="development-detail">{detail.session?.difficulty || "未記入"}</p>
      <h3>次に進めること</h3><p className="development-detail">{detail.session?.nextStep || "未記入"}</p>
      <p>作業状態：{detail.session?.mode ? workLabels[detail.session.mode] : "未設定"} / {helpLabels[detail.session?.help ?? "none"]}</p>
      {editable && day !== null && detail.session?.help === "requested" && <ResolveButton key={detail.session.revision} scope={{ courseId, studentId: detail.studentId }} day={day} revision={detail.session.revision} />}
      {day !== null && <><p>出席：{attendanceLabels[detail.attendance?.status ?? "unset"]}</p>
        {editable && <AttendanceForm key={detail.attendance?.revision ?? 0} scope={{ courseId, studentId: detail.studentId }} day={day} initial={detail.attendance} />}
        <p>出席更新：{time(detail.attendance?.updatedAt)}{detail.attendance && ` / 記録者ID：${detail.attendance.updatedBy}`}</p></>}
    </section> : <div className="development-table"><table><thead><tr><th>受講者</th><th>作業状態</th><th>相談</th><th>最終更新</th><th>出席</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.studentId}>
        <td><Link href={`/teacher/development?${params}&student=${encodeURIComponent(row.studentId)}`}>{row.displayName}</Link></td>
        <td>{row.session?.mode ? workLabels[row.session.mode] : "未設定"}</td><td>{helpLabels[row.session?.help ?? "none"]}</td>
        <td>{time(row.session?.updatedAt)}</td><td>{attendanceLabels[row.attendance?.status ?? "unset"]}</td>
      </tr>)}</tbody></table>{!rows.length && <p>このコースから起動した受講者はまだいません。</p>}</div>}
  </main>;
}
