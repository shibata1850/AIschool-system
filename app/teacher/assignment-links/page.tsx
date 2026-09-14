import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { teacherCourseAccess } from "@/lib/course/access";
import { createCanvasClient } from "@/lib/canvas/client";
import { listCanvasAssignmentLinks } from "@/lib/canvas/assignmentLinks";
import { toErrorMessage } from "@/lib/canvas/errorMessage";
import { listAllocationOptions } from "@/lib/f3/allocation";
import { AssignmentLinkForm } from "./link-form";

export const dynamic = "force-dynamic";

export default async function AssignmentLinksPage() {
  const actor = await getCurrentUser();
  const access = teacherCourseAccess(actor);
  if (!access?.courseId || !actor.viaLti) notFound();
  const { exercises } = await listAllocationOptions(access.courseId);
  const links = await listCanvasAssignmentLinks(access.courseId);
  const client = createCanvasClient();
  let targets: { id: number; name: string; published: boolean; points_possible: number | null }[] = [];
  let error = "";
  if (client) {
    try {
      const course = await client.getCourseByLtiContext(access.courseId);
      targets = await client.listAssignments(course.id);
    } catch (cause) { error = toErrorMessage(cause); }
  } else { error = "Canvasに接続していません"; }
  const availableExercises = exercises.filter(item => !links.some(link => link.assignmentId === item.id));
  const availableTargets = targets.filter(item => item.published && item.points_possible === 100 &&
    !links.some(link => link.canvasAssignmentId === item.id));
  return <main style={{ maxWidth: "52rem", minWidth: 0, overflowWrap: "anywhere" }}>
    <Link href="/teacher/assignments">課題の割当に戻る</Link>
    <h1>Canvas課題の対応</h1>
    <section>
      <h2>登録済み</h2>
      {links.length ? <dl>{links.map(link => <div key={link.assignmentId} style={{ padding: "0.75rem 0", borderBottom: "1px solid var(--fg-sub)" }}>
        <dt>{exercises.find(item => item.id === link.assignmentId)?.title ?? link.assignmentId}</dt>
        <dd style={{ margin: "0.5rem 0 0" }}>{targets.find(item => item.id === link.canvasAssignmentId)?.name ?? `Canvas課題 ID ${link.canvasAssignmentId}`}（登録済み）</dd>
      </div>)}</dl> : <p>登録済みの対応はありません。</p>}
    </section>
    <section>
      <h2>新規登録</h2>
      {error ? <p role="alert">{error}</p> : !availableExercises.length ? <p>未登録の演習はありません。</p> :
        !availableTargets.length ? <p>登録できる公開中・100点満点のCanvas課題がありません。</p> :
        <AssignmentLinkForm exercises={availableExercises} targets={availableTargets.map(({ id, name }) => ({ id, name }))} />}
    </section>
  </main>;
}
