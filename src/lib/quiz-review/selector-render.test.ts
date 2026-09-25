import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReviewForm from "../../../app/teacher/quiz-review/review-form";

it("distinguishes same-stage quizzes without removing cross-course access", () => {
  const html = renderToStaticMarkup(createElement(ReviewForm, {
    publicationEnabled: false,
    quizzes: [
      { id: 4, courseId: 1, step: "STEP01", stage: "F" },
      { id: 100, courseId: 2, step: "STEP01", stage: "F" },
    ],
  }));
  expect(html).toContain('value="4">コース1 · STEP01 · 最終テスト · 小テスト4</option>');
  expect(html).toContain('value="100">コース2 · STEP01 · 最終テスト · 小テスト100</option>');
});
