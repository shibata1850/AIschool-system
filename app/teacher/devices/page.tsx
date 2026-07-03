import { getDeviceAssignments } from "@/lib/f3/store";
import { STUDENTS } from "@/lib/f4/fixtures";
import { BackupToggle } from "./backup-toggle";

export const dynamic = "force-dynamic";

/**
 * S9 デバイス割当（docs/画面仕様書.md S9）。
 * GOOVIS不調時に座席単位で予備機（モバイルモニター）へ切替できる。
 * 割当変更は監査ログに記録される。権限は proxy.ts（講師・管理者のみ）。
 */
export default function DevicesPage() {
  const assignments = getDeviceAssignments();
  const nameOf = new Map(STUDENTS.map((s) => [s.id, s.displayName]));

  return (
    <main style={{ maxWidth: "64rem" }}>
      <h1>デバイス割当</h1>
      <p style={{ color: "var(--fg-sub)", marginBottom: "1rem" }}>
        GOOVISの調子が悪いときは「予備機に切替」を押してください（モバイルモニター運用）。
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["座席", "受講生", "NUC", "GOOVIS", "表示デバイス", "操作"].map((h) => (
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
          {assignments.map((a) => (
            <tr key={a.seatNo} aria-label={`座席${a.seatNo}の割当`}>
              <td style={{ padding: "0.6rem" }}>{a.seatNo}</td>
              <td style={{ padding: "0.6rem" }}>{nameOf.get(a.studentId) ?? a.studentId}</td>
              <td style={{ padding: "0.6rem" }}>{a.nucId}</td>
              <td style={{ padding: "0.6rem" }}>{a.goovisId}</td>
              <td
                style={{
                  padding: "0.6rem",
                  color: a.usingBackup ? "var(--warn)" : "var(--fg)",
                }}
              >
                {a.usingBackup ? "予備機（モバイルモニター）" : "GOOVIS"}
              </td>
              <td style={{ padding: "0.6rem" }}>
                <BackupToggle seatNo={a.seatNo} usingBackup={a.usingBackup} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
