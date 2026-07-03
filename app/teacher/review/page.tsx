import { getStore } from "@/lib/f3/store";
import { ReviewForm } from "./review-form";

export const dynamic = "force-dynamic";

/** S7 採点・差戻し（docs/画面仕様書.md S7）。権限ガードは middleware.ts */
export default async function ReviewPage() {
  const store = getStore();
  const pending = [...store.submissions.values()].filter(
    (s) => s.status === "ai_graded",
  );

  return (
    <main>
      <h1>採点・差戻し</h1>
      {pending.length === 0 ? (
        <p>採点待ちの提出はありません。</p>
      ) : (
        pending.map((submission) => {
          const assignment = store.assignments.get(submission.assignmentId);
          return (
            <section
              key={submission.id}
              aria-label={`提出 ${submission.id}`}
              style={{
                border: "2px solid var(--fg-sub)",
                borderRadius: 8,
                padding: "1rem",
                margin: "1rem 0",
              }}
            >
              <h2 style={{ fontSize: "1.2rem" }}>{assignment?.title}</h2>
              <p style={{ color: "var(--fg-sub)" }}>
                提出者: {submission.studentId} ・第{submission.version}版
                {submission.isLate && (
                  <strong style={{ color: "var(--warn)" }}>（遅延提出）</strong>
                )}
              </p>
              <h3 style={{ fontSize: "1rem", marginTop: "0.5rem" }}>提出されたプロンプト</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>{submission.promptText}</p>
              {submission.aiGrade && (
                <>
                  <h3 style={{ fontSize: "1rem", marginTop: "0.5rem" }}>AI一次採点</h3>
                  <p>
                    総合スコア: <strong>{submission.aiGrade.totalScore}点</strong>
                  </p>
                  <p style={{ color: "var(--fg-sub)" }}>
                    採点根拠（講師向け）: {submission.aiGrade.rationale}
                  </p>
                </>
              )}
              <ReviewForm
                submissionId={submission.id}
                aiScore={submission.aiGrade?.totalScore ?? 0}
              />
            </section>
          );
        })
      )}
    </main>
  );
}
