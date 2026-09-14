import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { courseAccess } from "@/lib/course/access";
import { legacyPageNumber, readOwnLegacyHistory } from "@/lib/course/legacyHistory";
import { STATUS_LABELS, type ExerciseStatus } from "@/lib/f3/types";

export const dynamic = "force-dynamic";

function dateLabel(value: Date) {
  return value.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

export default async function LegacyHistoryPage({ searchParams }: {
  searchParams?: Promise<{ page?: string | string[] }>;
}) {
  const actor = await getCurrentUser();
  if (!courseAccess(actor)) notFound();
  const page = legacyPageNumber((await searchParams)?.page);
  if (page === null) notFound();
  const history = await readOwnLegacyHistory(actor, page);
  return <main className="legacy-history">
    <h1>旧履歴</h1>
    <p className="muted">コース未設定の記録です。現在のコースの課題・到達度には含まれません。</p>
    <section aria-label="過去の提出">
      <h2>過去の提出</h2>
      {history.submissions.length === 0 && <p>このページに記録はありません。</p>}
      {history.submissions.map(item => <article key={item.id}>
        <h3>{item.title ?? "過去の課題"}</h3>
        <p>{STATUS_LABELS[item.status as ExerciseStatus] ?? "記録済み"}</p>
        {item.submittedAt && <p>提出日時: {item.submittedAt}</p>}
        <p>確定スコア: {item.teacherScore ?? "未確定"}</p>
        <details><summary>提出内容</summary>
          <h4>プロンプト</h4><p>{item.promptText}</p>
          <h4>AIの出力</h4><p>{item.aiOutputText}</p>
          <h4>振り返り</h4><p>{item.reflectionText}</p>
          {item.feedback && <><h4>講評</h4><p>{item.feedback}</p></>}
          {item.teacherComment && <><h4>講師コメント</h4><p>{item.teacherComment}</p></>}
        </details>
      </article>)}
    </section>
    <section aria-label="過去の会話">
      <h2>過去の会話</h2>
      {history.chats.length === 0 && <p>このページに記録はありません。</p>}
      {history.chats.map(item => <article key={item.id}>
        <p>{dateLabel(item.askedAt)}</p><h3>質問</h3><p>{item.question}</p>
        <h3>回答</h3><p>{item.reply ?? "回答の記録はありません。"}</p>
      </article>)}
    </section>
    <section aria-label="過去の講師メッセージ">
      <h2>過去の講師メッセージ</h2>
      {history.messages.length === 0 && <p>このページに記録はありません。</p>}
      {history.messages.map(item => <article key={item.id}>
        <p>{dateLabel(item.sentAt)}</p><p>{item.body}</p>
      </article>)}
    </section>
    <section aria-label="過去の授業記録">
      <h2>過去の授業記録</h2>
      {history.lessons.length === 0 && <p>このページに記録はありません。</p>}
      {history.lessons.map(item => <article key={item.weekStart}>
        <h3>{item.weekStart} の週</h3>
        {item.dataMissing ? <p>記録不足</p> : <p>
          出席: {item.attended ? "出席" : "欠席"} ／ 提出: {item.submitted ? "あり" : "なし"} ／ スコア: {item.score ?? "未確定"}
        </p>}
      </article>)}
    </section>
    <nav aria-label="旧履歴のページ" className="actions">
      {page > 1 && <Link href={`/achievement/history?page=${page - 1}`}>前のページ</Link>}
      <span>{page} ページ</span>
      {history.hasNext && <Link href={`/achievement/history?page=${page + 1}`}>次のページ</Link>}
    </nav>
    <Link href="/">ホームへ戻る</Link>
  </main>;
}
