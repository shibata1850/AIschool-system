import { listCanvasSyncFailures, listSubmissionsPendingReview } from "@/lib/f3/store";
import { ReviewForm } from "./review-form";

export const dynamic = "force-dynamic";

/**
 * S7 採点・差戻し（docs/画面仕様書.md S7）。権限ガードは proxy.ts。
 * AI採点済に加え、AI採点が失敗して提出済のまま止まっている提出も表示し、
 * 講師の手動採点で完了・差戻しできるようにする（監査指摘#5）。
 */
export default async function ReviewPage() {
  const [pending, syncFailures] = await Promise.all([
    listSubmissionsPendingReview(),
    listCanvasSyncFailures(),
  ]);

  return (
    <main>
      <h1>採点・差戻し</h1>

      {syncFailures.length > 0 && (
        <section
          aria-label="Canvas未反映の提出"
          style={{
            border: "2px solid var(--warn)",
            borderRadius: 8,
            padding: "1rem",
            margin: "1rem 0",
          }}
        >
          <h2 style={{ fontSize: "1.1rem", color: "var(--warn)" }}>
            Canvas成績表に反映できていない提出（{syncFailures.length}件）
          </h2>
          <p style={{ color: "var(--fg-sub)" }}>
            採点は確定していますが、Canvasの成績表には載っていません。
            原因を解消したうえで、成績入力画面から手動で反映してください。
          </p>
          <ul style={{ paddingLeft: "1.2rem", marginTop: "0.5rem" }}>
            {syncFailures.map(({ submission, assignment }) => (
              <li key={submission.id}>
                {assignment?.title ?? submission.assignmentId} ／ 提出者{" "}
                {submission.studentId}
                {submission.teacherScore !== undefined && `（${submission.teacherScore}点）`}
                : {submission.canvasSyncError}
              </li>
            ))}
          </ul>
        </section>
      )}
      {pending.length === 0 ? (
        <p>採点待ちの提出はありません。</p>
      ) : (
        pending.map(({ submission, assignment }) => {
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
              {submission.aiOutputText && (
                <>
                  <h3 style={{ fontSize: "1rem", marginTop: "0.5rem" }}>AIの実行結果（受講生の貼り付け）</h3>
                  <p style={{ whiteSpace: "pre-wrap", color: "var(--fg-sub)" }}>
                    {submission.aiOutputText}
                  </p>
                </>
              )}
              {submission.aiGrade ? (
                <>
                  <h3 style={{ fontSize: "1rem", marginTop: "0.5rem" }}>AI一次採点</h3>
                  <p>
                    総合スコア: <strong>{submission.aiGrade.totalScore}点</strong>
                  </p>
                  <p style={{ color: "var(--fg-sub)" }}>
                    採点根拠（講師向け）: {submission.aiGrade.rationale}
                  </p>
                </>
              ) : (
                <p style={{ color: "var(--warn)" }}>
                  AI採点なし（失敗または処理中）。手動でスコアを入力してください
                </p>
              )}
              <ReviewForm
                submissionId={submission.id}
                aiScore={submission.aiGrade?.totalScore}
              />
            </section>
          );
        })
      )}
    </main>
  );
}
