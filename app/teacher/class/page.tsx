import { createCanvasClient } from "@/lib/canvas/client";
import { resolveCourseData } from "@/lib/canvas/courseData";

export const dynamic = "force-dynamic";

/**
 * クラス名簿（講師・管理者 — proxy.ts の /teacher ガード）。
 * Canvas接続時は実際の受講生名簿と課題を表示する（F1/F3の連携確認）。
 * 未接続時はデモモードの案内を出す（インメモリ動作）。
 */
export default async function ClassPage() {
  const data = await resolveCourseData(createCanvasClient());

  return (
    <main style={{ maxWidth: "48rem" }}>
      <h1>クラス名簿</h1>
      <p style={{ color: "var(--fg-sub)", marginBottom: "1rem" }}>
        Canvasに登録されている受講生と課題の一覧です。
      </p>

      {data.state === "notConfigured" && (
        <p
          style={{ padding: "1rem", border: "1px solid var(--fg-sub)", borderRadius: "0.5rem" }}
        >
          いまはデモモードです（Canvas未接続）。接続すると実際のクラス名簿が表示されます。
        </p>
      )}

      {data.state === "empty" && (
        <p style={{ color: "var(--fg-sub)" }}>
          Canvasにコースがまだありません。デモデータ投入（infra/canvas/seed-demo-data.sh）で
          架空のクラスを作成できます。
        </p>
      )}

      {data.state === "error" && (
        <p
          role="status"
          style={{ padding: "1rem", border: "2px solid #d33", borderRadius: "0.5rem" }}
        >
          Canvasから取得できませんでした。{data.message}
        </p>
      )}

      {data.state === "ok" && (
        <>
          <h2>{data.course.name}</h2>

          <h3>受講生（{data.students.length}名）</h3>
          {data.students.length === 0 ? (
            <p style={{ color: "var(--fg-sub)" }}>まだ受講生が登録されていません。</p>
          ) : (
            <ul style={{ lineHeight: 1.9 }}>
              {data.students.map((s) => (
                <li key={s.id}>{s.name}</li>
              ))}
            </ul>
          )}

          <h3 style={{ marginTop: "1.5rem" }}>課題（{data.assignments.length}件）</h3>
          {data.assignments.length === 0 ? (
            <p style={{ color: "var(--fg-sub)" }}>公開中の課題がありません。</p>
          ) : (
            <ul style={{ lineHeight: 1.9 }}>
              {data.assignments.map((a) => (
                <li key={a.id}>{a.title}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
