import type { TrainingLinkPolicy } from "./trainingPolicy";

const btobContext = "f97330a96452fc363a34e0ef6d8d0d3e9e1007d2";
const materialBase = "https://ngas-step01-pc-review.vercel.app/btob/";
const finalQuizIds = [100, 129, 109, 118, 130, 108, 132, 124, 92];

/** Verified destinations only; Canvas publication/enrollment remain separate gates. */
export function trainingLinkPolicy(courseId: string): TrainingLinkPolicy {
  if (courseId !== btobContext) return { materialUrls: [], quizUrls: [] };
  return {
    materialUrls: [materialBase, ...Array.from({ length: 8 }, (_, i) =>
      `${materialBase}step${String(i + 2).padStart(2, "0")}/`)],
    quizUrls: finalQuizIds.map(id =>
      `https://canvas.133-125-225-64.sslip.io/courses/2/quizzes/${id}`),
  };
}
