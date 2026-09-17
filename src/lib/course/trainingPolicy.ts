export interface TrainingDay {
  day: number;
  title: string;
  materialUrl: string | null;
  quizUrl: string | null;
}

export interface TrainingSettings {
  courseId: string;
  mode: "legacy" | "btob";
  currentDay: number | null;
  revision: number;
  days: TrainingDay[];
}

/** Server-controlled, verified links; never accept this policy from request data. */
export interface TrainingLinkPolicy {
  materialUrls: readonly string[];
  quizUrls: readonly string[];
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function dayNumber(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 1 && value <= 10;
}

function httpsLink(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || value !== value.trim() ||
      /[\s\\\u0000-\u001f\u007f]/u.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    return url.href;
  } catch {
    return null;
  }
}

function approvedLink(value: unknown, allowed: readonly string[]): string | null | undefined {
  if (value === null) return null;
  const url = httpsLink(value);
  if (!url || !allowed.some(candidate => httpsLink(candidate) === url)) return undefined;
  return url;
}

/** Invalid stored/request data must not silently become a legacy course. */
export function parseTrainingSettings(
  input: unknown,
  verifiedCourseId: string,
  links: TrainingLinkPolicy,
): TrainingSettings | null {
  if (!verifiedCourseId.trim() || !record(input) || input.courseId !== verifiedCourseId ||
      (input.mode !== "legacy" && input.mode !== "btob") ||
      (input.currentDay !== null && !dayNumber(input.currentDay)) ||
      !Number.isSafeInteger(input.revision) || (input.revision as number) < 0 ||
      !Array.isArray(input.days) || input.days.length > 10) return null;

  const days: TrainingDay[] = [];
  const seen = new Set<number>();
  for (const value of input.days) {
    if (!record(value) || !dayNumber(value.day) || seen.has(value.day) ||
        typeof value.title !== "string" || !value.title.trim() || value.title.length > 120 ||
        /[\u0000-\u001f\u007f]/u.test(value.title)) return null;
    const materialUrl = approvedLink(value.materialUrl, links.materialUrls);
    const quizUrl = approvedLink(value.quizUrl, links.quizUrls);
    if (materialUrl === undefined || quizUrl === undefined) return null;
    seen.add(value.day);
    days.push({ day: value.day, title: value.title.trim(), materialUrl, quizUrl });
  }
  if (input.currentDay !== null && !seen.has(input.currentDay as number)) return null;
  return {
    courseId: verifiedCourseId,
    mode: input.mode as TrainingSettings["mode"],
    currentDay: input.currentDay as number | null,
    revision: input.revision as number,
    days: days.sort((a, b) => a.day - b.day),
  };
}

export type TrainingHome =
  | { state: "legacy" }
  | { state: "error"; message: string }
  | { state: "unselected"; message: string }
  | { state: "ready"; lesson: TrainingDay };

/** undefined denotes a failed read; null denotes an absent setting. */
export function trainingHome(
  input: unknown,
  verifiedCourseId: string,
  links: TrainingLinkPolicy,
): TrainingHome {
  if (!verifiedCourseId.trim()) return { state: "error", message: "Canvasのコースから起動してください。" };
  if (input === null) return { state: "legacy" };
  const settings = parseTrainingSettings(input, verifiedCourseId, links);
  if (!settings) return { state: "error", message: "授業設定を確認できません。講師にお知らせください。" };
  if (settings.mode === "legacy") return { state: "legacy" };
  if (settings.currentDay === null) return { state: "unselected", message: "現在の授業はまだ選択されていません。" };
  return { state: "ready", lesson: settings.days.find(day => day.day === settings.currentDay)! };
}
