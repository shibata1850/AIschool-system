import { notFound } from "next/navigation";
import { getCurrentStudentId } from "@/lib/auth";
import { findSubmission, getStore } from "@/lib/f3/store";
import { STATUS_LABELS } from "@/lib/f3/types";
import { AutoRefresh } from "./auto-refresh";
import { SubmissionForm } from "./submission-form";

export const dynamic = "force-dynamic";

/** S2 プロンプト演習（docs/画面仕様書.md S2） */
export default async function ExercisePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const store = getStore();
  const assignment = store.assignments.get(id);
  if (!assignment) notFound();

  const submission = findSubmission(id, getCurrentStudentId());
  if (!submission) notFound();

  const editable = ["not_started", "in_progress", "returned"].includes(
    submission.status,
  );

  return (
    <main>
      <AutoRefresh active={submission.status === "submitted"} />
      <h1>{assignment.title}</h1>
      <p aria-label="状態">
        いまの状態: <strong>{STATUS_LABELS[submission.status]}</strong>
        {submission.isLate && <strong>（遅延）</strong>}
        {submission.version > 1 && <span> ・第{submission.version}版</span>}
      </p>

      {submission.status === "submitted" && (
        <p aria-label="採点中" style={{ color: "var(--accent)" }}>
          AIが採点中（さいてんちゅう）です。そのまま待っていてね…
        </p>
      )}

      <section aria-label="課題の説明" style={{ margin: "1rem 0" }}>
        <p>{assignment.description}</p>
      </section>

      {submission.status === "returned" && submission.teacherComment && (
        <section
          aria-label="先生からのコメント"
          style={{ border: "2px solid var(--warn)", borderRadius: 8, padding: "1rem", margin: "1rem 0" }}
        >
          <h2 style={{ fontSize: "1.1rem" }}>先生からのコメント（差戻し）</h2>
          <p>{submission.teacherComment}</p>
        </section>
      )}

      {submission.aiGrade &&
        (submission.status === "ai_graded" || submission.status === "completed") && (
          <section
            aria-label="AIからの講評"
            style={{ border: "2px solid var(--accent)", borderRadius: 8, padding: "1rem", margin: "1rem 0" }}
          >
            <h2 style={{ fontSize: "1.1rem" }}>AIからの講評（こうひょう）</h2>
            <p>{submission.aiGrade.feedback}</p>
            {submission.status === "ai_graded" && (
              <p style={{ color: "var(--fg-sub)" }}>
                先生の確認を待っています。点数は先生の確認後に決まります。
              </p>
            )}
            {submission.status === "completed" && (
              <p aria-label="点数">
                点数: <strong>{submission.teacherScore}点</strong>（成績に反映されました）
              </p>
            )}
          </section>
        )}

      {editable && (
        <SubmissionForm assignmentId={assignment.id} charLimit={assignment.charLimit} />
      )}
    </main>
  );
}
