import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { listTeacherMessages } from "@/lib/f2/chatLog";
import { listActiveSubmissionsForStudent } from "@/lib/f3/store";
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

  const [items, messages] = await Promise.all([
    listActiveSubmissionsForStudent(userId),
    listTeacherMessages(userId),
  ]);

  return (
    <main>
      <h1>今日やること</h1>
      <p className="lead">未提出の課題を、締切が近い順に並べています。</p>

      {messages.length > 0 && (
        <section aria-label="講師からのメッセージ" style={{ margin: "1rem 0" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>
            講師からのメッセージ
          </h2>
          <ul style={{ listStyle: "none" }}>
            {messages.map((m) => (
              <li
                key={m.id}
                style={{
                  border: "2px solid var(--accent)",
                  borderRadius: 8,
                  padding: "0.75rem",
                  margin: "0.5rem 0",
                }}
              >
                {/*
                  プロンプト本文を受け取る用途があるため、改行をそのまま表示して
                  そのままコピーできるようにする（2026-09-02）
                */}
                <p style={{ whiteSpace: "pre-wrap" }}>{m.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {items.length === 0 ? (
        <div className="banner banner--ok">
          <p className="banner__title">すべて完了しています。</p>
          <p className="muted">新しい課題が出ると、ここに表示されます。</p>
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
          AI講師に質問する
        </Link>
        <Link href="/achievement" className="button">
          自分の到達度
        </Link>
      </nav>

      {(role === "teacher" || role === "admin") && (
        <section aria-label="講師用メニュー" style={{ marginTop: "2.5rem" }}>
          <h2>講師用メニュー</h2>
          <ul className="card-list">
            {[
              { href: "/teacher/monitor", title: "授業中モニタリング", desc: "16席の状態を色で把握" },
              { href: "/teacher/attendance", title: "出席の記録", desc: "この授業の出席をつける" },
              { href: "/teacher/review", title: "採点・差戻し", desc: "AI一次採点の確認と確定" },
              { href: "/teacher/report", title: "週次到達度レポート", desc: "クラス全体の伸び・停滞" },
              { href: "/teacher/chat-logs", title: "AI講師の会話ログ", desc: "何を聞かれたかの記録" },
              { href: "/teacher/class", title: "クラス名簿（Canvas）", desc: "受講生と課題の一覧" },
              { href: "/teacher/grade", title: "成績入力（Canvas）", desc: "点数をCanvasへ反映" },
              { href: "/teacher/summary", title: "成績サマリ（Canvas）", desc: "提出率・平均点の集計" },
            ].map((m) => (
              <li key={m.href}>
                <Link href={m.href} className="card">
                  <span style={{ fontSize: "1.05rem", fontWeight: 600 }}>{m.title}</span>
                  <span className="muted" style={{ display: "block" }}>
                    {m.desc}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {role === "admin" && (
        <section aria-label="管理者メニュー" style={{ marginTop: "1.5rem" }}>
          <h2>管理者メニュー</h2>
          <ul className="card-list">
            {[
              { href: "/admin/audit", title: "監査ログ", desc: "操作の記録（作成・更新・削除）" },
              { href: "/admin/canvas", title: "Canvas連携状況", desc: "接続確認・コース一覧" },
            ].map((m) => (
              <li key={m.href}>
                <Link href={m.href} className="card">
                  <span style={{ fontSize: "1.05rem", fontWeight: 600 }}>{m.title}</span>
                  <span className="muted" style={{ display: "block" }}>
                    {m.desc}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
