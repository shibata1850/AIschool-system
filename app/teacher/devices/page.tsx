import { getDeviceAssignments } from "@/lib/f3/store";
import { getRoster } from "@/lib/roster";
import { BackupToggle } from "./backup-toggle";
import { StudentPicker } from "./student-picker";

export const dynamic = "force-dynamic";

/**
 * S9 デバイス割当（docs/画面仕様書.md S9）。
 * 主モニター不調時に座席単位で予備機へ切替できる。
 * 割当変更は監査ログに記録される。権限は proxy.ts（講師・管理者のみ）。
 */
export default async function DevicesPage() {
  // 名簿は**LTI起動の記録が正**（fixtures ではない）。架空名簿を引くと、実際に
  // 起動した受講生を座席へ割り当てられない（2026-09-04、座席番号0で顕在化）
  const [assignments, roster] = await Promise.all([getDeviceAssignments(), getRoster()]);
  const nameOf = new Map(roster.map((s) => [s.id, s.displayName]));
  const pickerRoster = roster.map((s) => ({ id: s.id, displayName: s.displayName }));

  return (
    <main style={{ maxWidth: "64rem" }}>
      <h1>デバイス割当</h1>
      <p style={{ color: "var(--fg-sub)", marginBottom: "1rem" }}>
        受講生が座った席を選んで「保存」を押してください。
        モニターの調子が悪いときは「予備機に切替」を押してください。
      </p>
      <p className="muted" style={{ marginBottom: "1rem" }}>
        受講生の一覧には、一度でも教材を開いた人が並びます。
        まだ誰も開いていない場合は、開いてもらってからこの画面を開き直してください。
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["座席", "受講生", "受講生の割当", "NUC", "モニター識別子", "表示デバイス", "操作"].map((h) => (
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
              <td style={{ padding: "0.6rem" }}>
                {a.studentId === null ? (
                  "空席"
                ) : nameOf.has(a.studentId) ? (
                  nameOf.get(a.studentId)
                ) : (
                  // 開校前の初期データが残っている席。講師が割り当て直すと消える
                  <span style={{ color: "var(--warn)" }}>
                    名簿にない割当（{a.studentId}）
                  </span>
                )}
              </td>
              <td style={{ padding: "0.6rem" }}>
                <StudentPicker
                  seatNo={a.seatNo}
                  studentId={a.studentId}
                  roster={pickerRoster}
                />
              </td>
              <td style={{ padding: "0.6rem" }}>{a.nucId}</td>
              <td style={{ padding: "0.6rem" }}>{a.monitorId}</td>
              <td
                style={{
                  padding: "0.6rem",
                  color: a.usingBackup ? "var(--warn)" : "var(--fg)",
                }}
              >
                {a.usingBackup ? "予備機" : "主モニター"}
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
