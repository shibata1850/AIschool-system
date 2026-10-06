import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canReadAllCourses, courseAccess } from "@/lib/course/access";
import { readTrainingSettings } from "@/lib/course/trainingStore";
import { parseTrainingSettings } from "@/lib/course/trainingPolicy";
import { trainingLinkPolicy } from "@/lib/course/trainingLinks";
import { readDevelopment } from "@/lib/development/store";
import { attendanceLabels, projectUrl } from "@/lib/development/policy";
import { ProjectForm, SessionForm, RefreshButton } from "./forms";
import { ProjectQr } from "./project-qr";
import "./style.css";
export const dynamic = "force-dynamic";

export default async function DevelopmentPage() {
  const actor = await getCurrentUser(), courseId = courseAccess(actor)?.courseId;
  if (!actor.viaLti || !courseId) notFound();
  const settings = parseTrainingSettings(await readTrainingSettings(actor, courseId), courseId, trainingLinkPolicy(courseId));
  if (settings?.mode !== "development") notFound();
  const staff = canReadAllCourses(actor);
  const data = staff ? null : await readDevelopment(actor, courseId, actor.userId, settings.currentDay);
  const current = settings.days.find(d => d.day === settings.currentDay);
  return <main className="development">
    <h1>システム開発コース</h1>
    <nav className="actions" aria-label="コースメニュー">
      <a href="#materials">教材</a>{!staff && <a href="#project">自分のシステム</a>}
      {staff && <><Link href="/teacher/development">受講状況・出席</Link><Link href="/teacher/training">授業設定</Link></>}
      <Link href="/chat">AI講師</Link>
    </nav>
    <section id="materials"><h2>{current ? `第${current.day}回：${current.title}` : "現在の授業：未選択"}</h2>
      {current && <ul className="development-materials">{[
        ["全員向け要点", current.materialUrl], ["必要な人向け", current.referenceUrl], ["補足", current.supplementUrl],
      ].map(([label, url]) => <li key={label}>{url ? <a href={url} target="_blank" rel="noopener noreferrer">{label}</a> : `${label}：準備中`}</li>)}</ul>}
      <details><summary>授業一覧</summary>{settings.days.map(day => <div key={day.day} className="development-lesson">
        <h3>第{day.day}回：{day.title}</h3>
        <ul>{[["全員向け要点", day.materialUrl], ["必要な人向け", day.referenceUrl], ["補足", day.supplementUrl]].map(([label, url]) =>
          <li key={label}>{url ? <a href={url} target="_blank" rel="noopener noreferrer">{label}</a> : `${label}：準備中`}</li>)}</ul>
      </div>)}</details>
    </section>
    {!staff && data && <>
      <section><RefreshButton />{settings.currentDay !== null && <>
        <p>第{settings.currentDay}回の出席：{attendanceLabels[data.attendance?.status ?? "unset"]}</p>
        <SessionForm key={`${settings.currentDay}:${data.session?.revision ?? 0}`} scope={{ courseId, studentId: actor.userId }} day={settings.currentDay} initial={data.session} />
      </>}</section>
      <section id="project"><div className="actions">
        {projectUrl(data.project?.editorUrl ?? null) && <a href={data.project!.editorUrl!} target="_blank" rel="noopener noreferrer">編集画面を開く</a>}
        {projectUrl(data.project?.previewUrl ?? null) && <a href={data.project!.previewUrl!} target="_blank" rel="noopener noreferrer">システムを開く</a>}
      </div><ProjectQr url={data.project?.previewUrl ?? null} /><ProjectForm scope={{ courseId, studentId: actor.userId }} initial={data.project} /></section>
    </>}
  </main>;
}
