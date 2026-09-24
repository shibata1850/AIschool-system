import { expect, it, vi } from "vitest";

vi.mock("./catalog.json", () => ({ default: { questions: [1, 2].map(course => ({
  canvas_course_id: course, canvas_quiz_id: course * 100,
  canvas_question_id: course * 1000, question_key: "STEP01/F01",
  step: "STEP01", stage: "F", skill_key: "STEP01/safety", points: 1,
  content_version: "fictional-test",
})) } }));

import catalog from "./catalog.json";
import { hash, parseReview } from "./policy";

function fixture(course: number) {
  const questions = catalog.questions.filter(q => q.canvas_course_id === course);
  return {
    schema: "ngas.canvas-csv-review.v1", source_instance: "test-canvas",
    source_origin: "https://canvas.example.test", course_id: course,
    quiz_id: course * 100, record_count: 1,
    records: [{
      identity: { source_instance: "test-canvas", canvas_course_id: course,
        canvas_quiz_id: course * 100, canvas_user_id: 9001, attempt: 1,
        step: "STEP01", stage: "F" },
      catalog_fingerprint: hash(questions), scores: { "STEP01/F01": 1 },
      total: { reported: 1 },
    }],
  };
}
const policy = (course: number) => ({ instance: "test-canvas",
  origin: "https://canvas.example.test", canvasCourseId: course });

it("keeps copied curriculum results separate for the same fictional learner", () => {
  const original = parseReview(fixture(1), policy(1))[0];
  const copied = parseReview(fixture(2), policy(2))[0];
  expect(original.earned).toBe(1);
  expect(copied.earned).toBe(1);
  expect(copied.sourceKey).not.toBe(original.sourceKey);
  expect(copied.revision).not.toBe(original.revision);
});

it("rejects the original catalog fingerprint on a copied quiz", () => {
  const copied = fixture(2);
  copied.records[0].catalog_fingerprint = fixture(1).records[0].catalog_fingerprint;
  expect(() => parseReview(copied, policy(2))).toThrow();
});

it("rejects a different course even when the curriculum keys match", () => {
  expect(() => parseReview(fixture(1), policy(2))).toThrow();
});
