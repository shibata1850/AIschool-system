import { listChatLogs, listStudentsWithChatLogs } from "@/lib/f2/chatLog";
import { STUDENTS } from "@/lib/f4/fixtures";

export const dynamic = "force-dynamic";

/**
 * AI講師の会話ログ閲覧（講師・管理者のみ。権限ガードは proxy.ts）。
 *
 * **何のためにあるか**:
 * 1. 柴田さまの要望（2026-08-24「会話については見れるほうがいい」）
 * 2. **第1期に何を聞かれたかを記録し、教材・講師手順書・FAQへ還元する**。
 *    講師の属人性を下げる原資はここにしかない（2026-09-02 隘路さまと合意）
 *
 * 表示するのは**マスキング済みの本文**（原文は保存していない）。
 * 保持期間は在籍＋退会後3年（未決#10）。退会時は `purgeStudentData` が消す。
 */
function formatJst(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 表示名を解決する。架空名簿に無いID（＝LTIの実利用者）は、IDをそのまま出す。
 * 実名簿との接続は別課題（docs/実装状況.md「生徒側画面を実データに接続する」）。
 */
function displayNameOf(studentId: string): string {
  return STUDENTS.find((s) => s.id === studentId)?.displayName ?? studentId;
}

export default async function ChatLogsPage() {
  // **記録があるIDを起点にする**（架空名簿を順に引くと、本番のLTI利用者の
  // ログが保存されていても0件に見える — 2026-09-02の不具合）
  const studentIds = await listStudentsWithChatLogs();
  const withLogs = await Promise.all(
    studentIds.map(async (studentId) => ({
      studentId,
      displayName: displayNameOf(studentId),
      logs: await listChatLogs(studentId, 50),
    })),
  );
  const total = withLogs.reduce((sum, r) => sum + r.logs.length, 0);

  return (
    <main style={{ maxWidth: "64rem" }}>
      <h1>AI講師の会話ログ</h1>
      <p className="lead">
        受講生がAI講師に何を聞いたかの記録です。教材や手順書に反映するための材料として使います。
      </p>
      <p className="muted">
        個人情報は伏せた状態で保存しています（原文は保存していません）。
        保持期間は在籍中＋退会後3年です。
      </p>

      {total === 0 ? (
        <p>まだ記録がありません。受講生がAI講師に質問すると、ここに表示されます。</p>
      ) : (
        <p>
          <strong>{total}</strong> 件の記録があります。
        </p>
      )}

      {withLogs.map(({ studentId, displayName, logs }) => (
        <section
          key={studentId}
          aria-label={`${displayName}の会話ログ`}
          style={{ marginTop: "1.5rem" }}
        >
          <h2 style={{ fontSize: "1.2rem" }}>
            {displayName}（{logs.length}件）
          </h2>
          <ul style={{ listStyle: "none" }}>
            {logs.map((log) => (
              <li
                key={log.id}
                style={{
                  border: "2px solid var(--fg-sub)",
                  borderRadius: 8,
                  padding: "0.75rem",
                  margin: "0.5rem 0",
                }}
              >
                <p className="muted">
                  {formatJst(log.askedAt)}
                  {log.elapsedMs !== null && <> ／ 応答 {(log.elapsedMs / 1000).toFixed(1)}秒</>}
                  {log.piiDetected && <> ／ 個人情報を伏せて送信</>}
                </p>
                <p style={{ whiteSpace: "pre-wrap" }}>質問: {log.maskedQuestion}</p>
                {log.blocked ? (
                  <p style={{ color: "var(--error)" }}>
                    この質問はフィルタでブロックしました（回答していません）
                  </p>
                ) : (
                  <p style={{ whiteSpace: "pre-wrap" }}>回答: {log.reply}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
