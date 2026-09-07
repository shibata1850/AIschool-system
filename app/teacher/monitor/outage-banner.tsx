import { getAiHealth, staticMaterial } from "@/lib/f2/outage";

function formatJst(date: Date): string {
  return date.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * S6: AI講師が停止中のとき、教室投影画面の最上部に出す帯（受け入れ基準 F2②「講師通知」）。
 * Canvasメッセージでの通知と併用する（メッセージは授業中に見ないことがある）。
 * NearHub投影前提: 太字・大きめ・高コントラスト。
 */
export async function OutageBanner() {
  const health = await getAiHealth();
  if (!health.outageStartedAt) return null;
  const material = staticMaterial();

  return (
    <section
      role="alert"
      aria-label="AI講師の停止"
      style={{
        border: "3px solid var(--warn)",
        borderRadius: 8,
        padding: "0.75rem 1rem",
        margin: "0 0 1rem",
        background: "var(--bg-panel)",
        fontSize: "1.1rem",
      }}
    >
      <p style={{ fontWeight: "bold" }}>
        AI講師 停止中（{formatJst(health.outageStartedAt)} から）
      </p>
      <p>
        受講生の画面には
        {material ? `「教材『${material.title}』を開いて先に進める」と` : ""}
        「講師に聞いてください」の案内が出ています。復旧すると自動で消えます。
      </p>
      <p className="muted" style={{ fontSize: "1rem" }}>
        {health.notifiedAt
          ? "Canvasメッセージでも通知済みです。"
          : `Canvasメッセージは未送信です（${health.notifySkippedReason ?? "送信処理中"}）。`}
      </p>
    </section>
  );
}
