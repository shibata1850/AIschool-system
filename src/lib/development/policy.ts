export const workLabels = { reading: "教材確認中", developing: "開発中" } as const;
export const helpLabels = { none: "相談なし", requested: "相談希望", resolved: "対応済み" } as const;
export const attendanceLabels = { unset: "未記録", present: "出席", absent: "欠席", late: "遅刻", left_early: "早退" } as const;
export type WorkMode = keyof typeof workLabels;
export type HelpState = keyof typeof helpLabels;
export type Attendance = keyof typeof attendanceLabels;
export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function shortText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max && !/[\u0000-\u0008\u000b-\u001f\u007f]/u.test(value);
}
// Links are never fetched server-side. Reject credential-bearing and signed URLs.
export function projectUrl(value: unknown): string | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 2048 || /[\s\\]/u.test(value)) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search ||
        !url.hostname.includes(".") || /(?:localhost|\.local)$/i.test(url.hostname)) return undefined;
    return url.href;
  } catch { return undefined; }
}
