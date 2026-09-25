import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TrainingForm } from "../../../../app/teacher/training/training-form";
import type { TrainingSettings } from "../trainingPolicy";

const initial: TrainingSettings = {
  courseId: "fictional-course", mode: "btob", currentDay: null, revision: 1,
  days: [{ day: 1, title: "Lesson 1", materialUrl: null, quizUrl: null }],
};

it("renders only server-approved link options", () => {
  const html = renderToStaticMarkup(createElement(TrainingForm, {
    initial,
    links: { materialUrls: ["https://material.example.test/step01/"],
      quizUrls: ["https://canvas.example.test/courses/2/quizzes/50"] },
  }));
  expect(html).toContain('id="training-material-1"');
  expect(html).toContain('id="training-quiz-1"');
  expect(html).toContain('value="https://material.example.test/step01/"');
  expect(html).toContain('value="https://canvas.example.test/courses/2/quizzes/50"');
  expect(html).not.toContain('type="url"');
});

it("does not invent links when none are approved", () => {
  const html = renderToStaticMarkup(createElement(TrainingForm, {
    initial, links: { materialUrls: [], quizUrls: [] },
  }));
  expect(html).not.toContain("https://");
  expect(html).toContain('id="training-material-1"');
});

it("preserves saved approved selections when editing settings", () => {
  const materialUrl = "https://material.example.test/step01/";
  const quizUrl = "https://canvas.example.test/courses/2/quizzes/50";
  const html = renderToStaticMarkup(createElement(TrainingForm, {
    initial: { ...initial, currentDay: 1,
      days: [{ ...initial.days[0], materialUrl, quizUrl }] },
    links: { materialUrls: [materialUrl], quizUrls: [quizUrl] },
  }));
  expect(html).toContain(`value="${materialUrl}" selected=""`);
  expect(html).toContain(`value="${quizUrl}" selected=""`);
  expect(html).toContain('value="1" selected=""');
});
