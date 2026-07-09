import { createCanvasClient } from "@/lib/canvas/client";
import { fetchCanvasStatus } from "@/lib/canvas/status";

export const dynamic = "force-dynamic";

/**
 * Canvas連携状況（管理者のみ — proxy.ts の /admin ガード）。
 * ステージングのCanvasに実際に接続できているか、コースが見えているかを確認する
 * 運用・診断用の画面。未設定時はインメモリ（デモ）モードである旨を表示する。
 */
export default async function CanvasStatusPage() {
  const status = await fetchCanvasStatus(createCanvasClient());

  return (
    <main style={{ maxWidth: "48rem" }}>
      <h1>Canvas連携状況</h1>
      <p style={{ color: "var(--fg-sub)", marginBottom: "1rem" }}>
        カスタム層がCanvas（学習管理システム）につながっているかの確認画面です。
      </p>

      {status.state === "notConfigured" && (
        <section
          style={{ padding: "1rem", border: "1px solid var(--fg-sub)", borderRadius: "0.5rem" }}
        >
          <p style={{ fontWeight: "bold" }}>いまはデモモードです（Canvas未接続）</p>
          <p style={{ color: "var(--fg-sub)" }}>
            接続先が設定されていないため、画面のデータは仮のデモ用データです。
            Canvasに接続するには、接続先とアクセストークンの設定が必要です。
          </p>
        </section>
      )}

      {status.state === "error" && (
        <section
          role="status"
          style={{
            padding: "1rem",
            border: "2px solid #d33",
            borderRadius: "0.5rem",
            background: "rgba(221,51,51,0.08)",
          }}
        >
          <p style={{ fontWeight: "bold" }}>Canvasにつながりませんでした</p>
          <p>{status.message}</p>
        </section>
      )}

      {status.state === "ok" && (
        <>
          <section
            style={{
              padding: "1rem",
              border: "2px solid #2a7",
              borderRadius: "0.5rem",
              background: "rgba(34,170,119,0.08)",
              marginBottom: "1.5rem",
            }}
          >
            <p style={{ fontWeight: "bold" }}>接続できています</p>
            <p style={{ color: "var(--fg-sub)" }}>
              管理者「{status.me.name}」として認証されています。
            </p>
          </section>

          <h2>コース一覧（{status.courses.length}件）</h2>
          {status.courses.length === 0 ? (
            <p style={{ color: "var(--fg-sub)" }}>
              まだコースがありません。デモデータ投入（infra/canvas/seed-demo-data.sh）で
              架空のコースを作成できます。
            </p>
          ) : (
            <ul style={{ lineHeight: 1.9 }}>
              {status.courses.map((c) => (
                <li key={c.id}>
                  {c.name}
                  <span style={{ color: "var(--fg-sub)" }}>（ID: {c.id}）</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
