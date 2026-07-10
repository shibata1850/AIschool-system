import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getStore } from "@/lib/f3/store";
import { STATUS_LABELS, type ExerciseStatus } from "@/lib/f3/types";

export const dynamic = "force-dynamic";

/** 状態バッジの色分け（差戻し=注意色、提出済/AI採点済=進行色、それ以外=通常） */
function badgeClass(status: ExerciseStatus): string {
  if (status === "returned") return "badge badge--warn";
  if (status === "submitted" || status === "ai_graded") return "badge badge--accent";
  return "badge";
}

/**
 * S1 受講生ホーム（docs/画面仕様書.md S1）。
 * ゲスト（体験会）には受講生の学習状況を表示しない
 * （2026-07-03 監査指摘#6: 学習ログは要配慮データ）。
 */
export default async function Home() {
  const { role, userId } = await getCurrentUser();

  if (role === "guest") {
    return (
      <main>
        <h1>Next Gen AI School へようこそ</h1>
        <p className="lead">
          体験会用のアカウントです。授業のようすは、スタッフがご案内します。
        </p>
      </main>
    );
  }

  const store = getStore();
  const items = [...store.submissions.values()]
    .filter((s) => s.studentId === userId && s.status !== "completed")
    .map((s) => ({
      submission: s,
      assignment: store.assignments.get(s.assignmentId),
    }));

  return (
    <main>
      <h1>きょうやること</h1>
      <p className="lead">未提出の課題を、しめきりが近い順にならべています。</p>

      {items.length === 0 ? (
        <div className="banner banner--ok">
          <p className="banner__title">ぜんぶ終わっています。おつかれさま！</p>
          <p className="muted">あたらしい課題が出ると、ここに表示されます。</p>
        </div>
      ) : (
        <ul className="card-list">
          {items.map(({ submission, assignment }) => (
            <li key={submission.id}>
              <Link href={`/exercises/${submission.assignmentId}`} className="card">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: "1.1rem", fontWeight: 600 }}>
                    {assignment?.title}
                  </span>
                  <span className={badgeClass(submission.status)}>
                    {STATUS_LABELS[submission.status]}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <nav aria-label="そのほかのページ" className="actions">
        <Link href="/chat" className="button">
          AI講師にきく
        </Link>
        <Link href="/achievement" className="button">
          じぶんの到達度
        </Link>
      </nav>
    </main>
  );
}
