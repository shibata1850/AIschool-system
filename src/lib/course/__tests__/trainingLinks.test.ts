import { describe, expect, it } from "vitest";
import { trainingLinkPolicy } from "../trainingLinks";
import { parseTrainingSettings } from "../trainingPolicy";

const context = "f97330a96452fc363a34e0ef6d8d0d3e9e1007d2";

describe("production training links", () => {
  it.each(["", "2", "4dde05e8ca1973bcca9bffc13e1548820eee93a3", `${context} `])(
    "keeps unapproved contexts empty: %s", courseId => {
      expect(trainingLinkPolicy(courseId)).toEqual({ materialUrls: [], quizUrls: [] });
    });
  it("offers nine verified materials and only the nine final quizzes", () => {
    const links = trainingLinkPolicy(context);
    expect(new Set(links.materialUrls).size).toBe(9);
    expect(links.materialUrls[0]).toBe("https://ngas-step01-pc-review.vercel.app/btob/");
    expect(links.materialUrls[8]).toBe("https://ngas-step01-pc-review.vercel.app/btob/step09/");
    expect(links.quizUrls.map(url => new URL(url).pathname)).toEqual(
      [100, 129, 109, 118, 130, 108, 132, 124, 92].map(id => `/courses/2/quizzes/${id}`));
  });
  it("accepts saved approved links but rejects a demo course quiz", () => {
    const links = trainingLinkPolicy(context);
    const settings = { courseId: context, mode: "btob", currentDay: 1, revision: 1,
      days: [{ day: 1, title: "Lesson 1", materialUrl: links.materialUrls[0], quizUrl: links.quizUrls[0] }] };
    expect(parseTrainingSettings(settings, context, links)).toEqual(settings);
    settings.days[0].quizUrl = "https://canvas.133-125-225-64.sslip.io/courses/1/quizzes/4";
    expect(parseTrainingSettings(settings, context, links)).toBeNull();
  });
  it("does not share mutable policy arrays between requests", () => {
    const links = trainingLinkPolicy(context);
    (links.materialUrls as string[]).push("https://unapproved.example/");
    expect(trainingLinkPolicy(context).materialUrls).toHaveLength(9);
  });
});
