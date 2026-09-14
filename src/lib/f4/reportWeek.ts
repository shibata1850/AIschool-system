import { weekStartOf } from "./weeklyReport";

export function currentReportWeek(now: Date): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const date = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return weekStartOf(new Date(`${date.year}-${date.month}-${date.day}T00:00:00Z`));
}

export function isReportWeek(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() === 1;
}
