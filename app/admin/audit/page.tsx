import { getAuditLog } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

/**
 * S10 監査ログ閲覧（docs/画面仕様書.md S10）。
 * 閲覧は管理者のみ（要件定義書5.2 — proxy.ts の /admin ガード）。
 * 変更前後の値を含めて新しい順に表示する。
 */
export default function AuditLogPage() {
  const entries = [...getAuditLog()].reverse();

  return (
    <main style={{ maxWidth: "64rem" }}>
      <h1>監査ログ</h1>
      <p style={{ color: "var(--fg-sub)", marginBottom: "1rem" }}>
        データの作成・更新・削除の記録です（操作者・日時・変更前後）。追記のみで削除できません。
      </p>
      {entries.length === 0 ? (
        <p>まだ記録がありません。</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["日時", "操作者", "操作", "対象", "変更前", "変更後"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "0.6rem",
                    borderBottom: "2px solid var(--fg-sub)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr key={i}>
                <td style={{ padding: "0.6rem", whiteSpace: "nowrap" }}>
                  {entry.at.replace("T", " ").slice(0, 19)}
                </td>
                <td style={{ padding: "0.6rem" }}>
                  {entry.actorRole}
                  {entry.actorId ? (
                    <span style={{ color: "var(--fg-sub)", fontSize: "0.85rem" }}>
                      {" "}
                      （{entry.actorId}）
                    </span>
                  ) : null}
                </td>
                <td style={{ padding: "0.6rem" }}>
                  {{ create: "作成", update: "更新", delete: "削除" }[entry.action]}
                </td>
                <td style={{ padding: "0.6rem" }}>
                  {entry.entity} / {entry.entityId}
                </td>
                <td style={{ padding: "0.6rem", fontSize: "0.9rem", color: "var(--fg-sub)" }}>
                  {entry.before !== undefined ? JSON.stringify(entry.before) : "—"}
                </td>
                <td style={{ padding: "0.6rem", fontSize: "0.9rem" }}>
                  {entry.after !== undefined ? JSON.stringify(entry.after) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
