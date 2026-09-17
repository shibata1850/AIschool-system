import type { TrainingLinkPolicy } from "./trainingPolicy";

/** No published links are approved yet. Never derive this list from request data. */
export function trainingLinkPolicy(_courseId: string): TrainingLinkPolicy {
  return { materialUrls: [], quizUrls: [] };
}
