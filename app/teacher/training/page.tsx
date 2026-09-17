import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { teacherCourseAccess } from "@/lib/course/access";
import { readTrainingSettings } from "@/lib/course/trainingStore";
import { parseTrainingSettings } from "@/lib/course/trainingPolicy";
import { trainingLinkPolicy } from "@/lib/course/trainingLinks";
import { TrainingForm } from "./training-form";

export const dynamic = "force-dynamic";

export default async function TrainingPage() {
  const actor = await getCurrentUser();
  const courseId = teacherCourseAccess(actor)?.courseId;
  if (!actor.viaLti || !courseId) return <main><h1>授業設定</h1><p>Canvasのコースから講師として起動してください。</p></main>;
  let initial;
  try {
    const stored = await readTrainingSettings(actor, courseId);
    initial = stored === null ? { courseId, mode: "legacy" as const, currentDay: null, revision: 0,
      days: Array.from({ length: 10 }, (_, i) => ({ day: i + 1, title: `第${i + 1}回`, materialUrl: null, quizUrl: null })) }
      : parseTrainingSettings(stored, courseId, trainingLinkPolicy(courseId));
  } catch { initial = null; }
  return <main style={{ maxWidth: "52rem" }}>
    <Link href="/">ホームにもどる</Link>
    <h1>授業設定</h1>
    {initial ? <TrainingForm initial={initial} /> : <p role="alert">授業設定を読み込めませんでした。再読み込みしてください。</p>}
  </main>;
}
