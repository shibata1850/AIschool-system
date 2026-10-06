import { describe, expect, it } from "vitest";
import { trainingLinkPolicy } from "../trainingLinks";
import { parseTrainingSettings } from "../trainingPolicy";

const context = "f97330a96452fc363a34e0ef6d8d0d3e9e1007d2";

describe("production training links", () => {
  it.each(["", "2", "4dde05e8ca1973bcca9bffc13e1548820eee93a3", `${context} `])(
    "keeps unapproved contexts empty: %s", courseId => {
      expect(trainingLinkPolicy(courseId)).toEqual({ materialUrls: [], quizUrls: [] });
    });
  it("preserves nine legacy materials and adds ten review destinations", () => {
    const links = trainingLinkPolicy(context);
    expect(new Set(links.materialUrls).size).toBe(19);
    expect(links.materialUrls.slice(9)).toEqual(Array.from({ length: 10 }, (_, i) =>
      `https://ngas-step01-pc-review.vercel.app/btob/development-review/day${String(i + 1).padStart(2, "0")}/index.html`));
    expect(links.materialUrls[0]).toBe("https://ngas-step01-pc-review.vercel.app/btob/");
    expect(links.materialUrls[8]).toBe("https://ngas-step01-pc-review.vercel.app/btob/step09/");
    expect(links.quizUrls.map(url => new URL(url).pathname)).toEqual(
      [100, 129, 109, 118, 130, 108, 132, 124, 92].map(id => `/courses/2/quizzes/${id}`));
  });
  it("accepts saved approved links but rejects a demo course quiz", () => {
    const links = trainingLinkPolicy(context);
    const settings = { courseId: context, mode: "btob", currentDay: 1, revision: 1,
      days: [{ day: 1, title: "Lesson 1", materialUrl: links.materialUrls[0], quizUrl: links.quizUrls[0], quizRequired: true }] };
    expect(parseTrainingSettings(settings, context, links)).toEqual({ ...settings,
      days: [{ ...settings.days[0], referenceUrl: null, supplementUrl: null }] });
    settings.days[0].quizUrl = "https://canvas.133-125-225-64.sslip.io/courses/1/quizzes/4";
    expect(parseTrainingSettings(settings, context, links)).toBeNull();
  });
  it("does not share mutable policy arrays between requests", () => {
    const links = trainingLinkPolicy(context);
    (links.materialUrls as string[]).push("https://unapproved.example/");
    expect(trainingLinkPolicy(context).materialUrls).toHaveLength(19);
  });
  it("accepts review materials without introducing quiz gates", () => {
    const links = trainingLinkPolicy(context);
    for (const materialUrl of links.materialUrls.slice(9)) {
      const input = { courseId: context, mode: "development", currentDay: 1, revision: 1,
        days: [{ day: 1, title: "確認版", materialUrl, quizUrl: null, quizRequired: false }] };
      expect(parseTrainingSettings(input, context, links)?.days[0].materialUrl).toBe(materialUrl);
      for (const invalid of [materialUrl + "?preview=1", materialUrl.replace("day01", "day00") + "#test",
        "https://ngas-step01-pc-review.vercel.app/btob/development-review/day11/index.html"]) {
        expect(parseTrainingSettings({ ...input, days: [{ ...input.days[0], materialUrl: invalid }] }, context, links)).toBeNull();
      }
    }
  });
});
