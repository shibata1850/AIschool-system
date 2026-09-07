/** 受講生の画面に出す停止情報（サーバー・APIの両方から同じ形で届く） */
export interface OutageNotice {
  since: string;
  material: { url: string; title: string } | null;
}

/**
 * S3: AI講師が止まっているときの案内（静的教材モード・受け入れ基準 F2②）。
 *
 * 決定（2026-09-04 柴田さま）: 方式 A-1a＋A-1c の併用。
 * - 教材の設定（STATIC_MATERIAL_URL）があれば教材へのリンクを出す（A-1a）
 * - 無くても「講師に聞いてください」は必ず出す（A-1c）
 * 小テスト・動画の視聴管理はeラーニング側の範囲（CLAUDE.md 13.1）なので出さない。
 *
 * NUC＋モバイルモニター／Quest 3 の高コントラスト前提: 太い枠・大きめの文字。
 */
export function OutageNoticeBox({ outage }: { outage: OutageNotice }) {
  return (
    <section
      role="status"
      aria-label="AI講師の停止案内"
      style={{
        border: "3px solid var(--warn)",
        borderRadius: 8,
        padding: "1rem",
        margin: "0.5rem 0 1rem",
        fontSize: "1.1rem",
        background: "var(--bg-panel)",
      }}
    >
      <p style={{ fontWeight: "bold", marginBottom: "0.5rem" }}>
        AI講師は今、一時的に使えません。
      </p>
      {outage.material ? (
        <p style={{ marginBottom: "0.5rem" }}>
          教材「
          <a href={outage.material.url} target="_blank" rel="noopener noreferrer">
            {outage.material.title}
          </a>
          」を開いて、先に進めておいてください。
        </p>
      ) : null}
      <p>分からないことは講師に聞いてください。</p>
      <p className="muted" style={{ marginTop: "0.5rem", fontSize: "1rem" }}>
        復旧すると自動で元に戻ります。「きく」を押すと再確認します。
      </p>
    </section>
  );
}
