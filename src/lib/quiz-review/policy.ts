import { createHash } from "node:crypto";
import catalog from "./catalog.json";
import type {ReportSource} from "./report";

export class QuizReviewError extends Error {
  constructor(message: string, public status: 400 | 403 | 409 | 413 | 503 = 400) { super(message); }
}
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue => !!value && typeof value === "object" && !Array.isArray(value);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
export const hash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
export type Skill = { key: string; earned: number | null; possible: number; ungraded: number };
export type ReviewRecord = {
  source?: ReportSource;
  sourceKey: string; revision: string; canvasUserId: number; quizId: number; attempt: number;
  step: string; stage: string; scores: Record<string, number | null>;
  skills: Skill[]; earned: number | null; possible: number; reported: number;
};
export type ReviewPolicy = { instance: string; origin: string; canvasCourseId: number };

/** Only normalized scores are retained. Names, responses and supplied summaries are discarded. */
export function parseReview(input: unknown, policy: ReviewPolicy): ReviewRecord[] {
  const invalid = () => { throw new QuizReviewError("確認用JSONの形式・コース・設問・得点を確認してください"); };
  if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(policy.instance) || !positive(policy.canvasCourseId)) return invalid();
  if (!object(input) || input.schema !== "ngas.canvas-csv-review.v1" || input.source_instance !== policy.instance ||
      input.source_origin !== policy.origin || input.course_id !== policy.canvasCourseId || !positive(input.quiz_id) ||
      !Array.isArray(input.records) || input.record_count !== input.records.length || input.records.length > 100) return invalid();
  const questions = catalog.questions.filter(q => q.canvas_course_id === input.course_id && q.canvas_quiz_id === input.quiz_id)
    .sort((a,b) => a.question_key.localeCompare(b.question_key));
  if (!questions.length) return invalid();
  const fingerprint = hash(questions);
  const expected = questions.map(q => q.question_key).sort();
  const seen = new Set<string>();
  // Six decimal places, in integer millionths, avoid floating sum/rounding discrepancies.
  function units(value: unknown, maximum: number): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum ||
        Math.abs(value * 1e6 - Math.round(value * 1e6)) > 1e-7) return invalid();
    return Math.round(value * 1e6);
  }
  return input.records.map((raw): ReviewRecord => {
    if (!object(raw) || !object(raw.identity) || !object(raw.scores)) return invalid();
    const id = raw.identity;
    if (id.source_instance !== policy.instance || id.canvas_course_id !== policy.canvasCourseId ||
        id.canvas_quiz_id !== input.quiz_id || !positive(id.canvas_user_id) || !positive(id.attempt) ||
        id.step !== questions[0].step || id.stage !== questions[0].stage || raw.catalog_fingerprint !== fingerprint ||
        canonical(Object.keys(raw.scores).sort()) !== canonical(expected) || !object(raw.total)) return invalid();
    const scoreUnits: Record<string, number | null> = {};
    for (const q of questions) scoreUnits[q.question_key] = raw.scores[q.question_key] === null ? null : units(raw.scores[q.question_key], q.points);
    const missing = Object.values(scoreUnits).some(v => v === null);
    const possible = questions.reduce((sum,q) => sum + q.points, 0);
    const reportedUnits = units(raw.total.reported, possible);
    const known = Object.values(scoreUnits).reduce<number>((sum,v) => sum + (v ?? 0), 0);
    if (missing ? known > reportedUnits : known !== reportedUnits) return invalid();
    const scores = Object.fromEntries(Object.entries(scoreUnits).map(([key,v]) => [key, v === null ? null : v / 1e6]));
    const skills = [...new Set(questions.map(q => q.skill_key))].sort().map(key => {
      const group = questions.filter(q => q.skill_key === key);
      const ungraded = group.filter(q => scoreUnits[q.question_key] === null).length;
      return {key, earned: ungraded ? null : group.reduce((n,q) => n + (scoreUnits[q.question_key] ?? 0), 0) / 1e6,
        possible: group.reduce((n,q) => n + q.points, 0), ungraded};
    });
    const sourceKey = hash([policy.instance, policy.canvasCourseId, input.quiz_id, id.canvas_user_id, id.attempt]);
    if (seen.has(sourceKey)) return invalid();
    seen.add(sourceKey);
    return { sourceKey, revision: hash({fingerprint, scores, reported: reportedUnits / 1e6}),
      canvasUserId: id.canvas_user_id, quizId: input.quiz_id as number, attempt: id.attempt,
      step: id.step as string, stage: id.stage as string, scores, skills,
      earned: missing ? null : known / 1e6, possible, reported: reportedUnits / 1e6 };
  });
}
