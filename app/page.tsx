import Link from "next/link";
import { getStore } from "@/lib/f3/store";
import { STATUS_LABELS } from "@/lib/f3/types";

export const dynamic = "force-dynamic";

/** S1 受講生ホーム（docs/画面仕様書.md S1） */
export default function Home() {
  const store = getStore();
  const items = [...store.submissions.values()]
    .filter((s) => s.studentId === "student-demo" && s.status !== "completed")
    .map((s) => ({
      submission: s,
      assignment: store.assignments.get(s.assignmentId),
    }));

  return (
    <main>
      <h1>きょうやること</h1>
      {items.length === 0 ? (
        <p>ぜんぶ終わっています。おつかれさま！</p>
      ) : (
        <ul style={{ listStyle: "none" }}>
          {items.map(({ submission, assignment }) => (
            <li key={submission.id} style={{ margin: "1rem 0" }}>
              <Link
                href={`/exercises/${submission.assignmentId}`}
                className="button"
                style={{ display: "inline-block", textDecoration: "none" }}
              >
                {assignment?.title}（{STATUS_LABELS[submission.status]}）
              </Link>
            </li>
          ))}
        </ul>
      )}
      <nav aria-label="そのほかのページ" style={{ marginTop: "2rem", display: "flex", gap: "1rem" }}>
        <Link href="/chat" className="button" style={{ display: "inline-block", textDecoration: "none" }}>
          AI講師にきく
        </Link>
        <Link href="/achievement" className="button" style={{ display: "inline-block", textDecoration: "none" }}>
          じぶんの到達度
        </Link>
      </nav>
    </main>
  );
}
