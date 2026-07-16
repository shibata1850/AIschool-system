import type { AuditEntry } from "./log";

/**
 * 監査ログをCSV文字列へ変換する（S10: エクスポートはCSV）。
 * カンマ・引用符・改行を含む値はRFC 4180に従って引用符で囲みエスケープする。
 */

const HEADER = [
  "日時",
  "操作者ロール",
  "操作者ID",
  "操作",
  "対象",
  "対象ID",
  "変更前",
  "変更後",
] as const;

function escapeField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function auditToCsv(entries: readonly AuditEntry[]): string {
  const lines = [HEADER.join(",")];
  for (const e of entries) {
    const row = [
      e.at,
      e.actorRole,
      e.actorId ?? "",
      e.action,
      e.entity,
      e.entityId,
      e.before !== undefined ? JSON.stringify(e.before) : "",
      e.after !== undefined ? JSON.stringify(e.after) : "",
    ];
    lines.push(row.map((v) => escapeField(String(v))).join(","));
  }
  return lines.join("\r\n");
}
