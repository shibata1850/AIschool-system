import { describe, expect, it } from "vitest";
import { parseTrainingSettings, trainingHome } from "../trainingPolicy";

const material = "https://materials.example.test/student/day1.html";
const quiz = "https://canvas.example.test/courses/12/quizzes/34";
const policy = { materialUrls: [material], quizUrls: [quiz] };
const setting = () => ({ courseId: "lti-context-12", mode: "btob", currentDay: 1, revision: 0,
  days: [{ day: 1, title: "AI基礎", materialUrl: material, quizUrl: quiz }] });

describe("training settings", () => {
  it.each([undefined, null, "", "student", ["btob"], { toString: () => "btob" }])("rejects invalid mode %s", mode => {
    expect(parseTrainingSettings({ ...setting(), mode }, "lti-context-12", policy)).toBeNull();
  });
  it("accepts the verified course and explicit approved links", () => {
    expect(parseTrainingSettings(setting(), "lti-context-12", policy)).toEqual(setting());
  });
  it("does not equate a numeric Canvas ID with an LTI context", () => {
    expect(parseTrainingSettings(setting(), "12", policy)).toBeNull();
  });
  it.each([0, 11, 1.5, "1", undefined])("rejects invalid current day %s", currentDay => {
    expect(parseTrainingSettings({ ...setting(), currentDay }, "lti-context-12", policy)).toBeNull();
  });
  it("rejects duplicate days", () => {
    const value = setting();
    value.days.push(value.days[0]);
    expect(parseTrainingSettings(value, value.courseId, policy)).toBeNull();
  });
  it("rejects a selected day without a record", () => {
    expect(parseTrainingSettings({ ...setting(), currentDay: 2 }, "lti-context-12", policy)).toBeNull();
  });
  it.each([-1, 0.5, "0", Number.MAX_SAFE_INTEGER + 1])("rejects invalid revision %s", revision => {
    expect(parseTrainingSettings({ ...setting(), revision }, "lti-context-12", policy)).toBeNull();
  });
  it.each(["", " ", "x".repeat(121), "hello\nworld"])("rejects invalid title", title => {
    const value = setting(); value.days[0].title = title;
    expect(parseTrainingSettings(value, value.courseId, policy)).toBeNull();
  });
  it.each([
    "http://materials.example.test/student/day1.html",
    "javascript:alert(1)",
    "https://user:secret@materials.example.test/student/day1.html",
    material + "?token=secret", material + "#answer", material + "/extra",
    "https://materials.example.test/teacher/answers.html",
    "https://materials.example.test.evil.test/student/day1.html",
  ])("rejects unsafe or unapproved material link %s", materialUrl => {
    const value = setting(); value.days[0].materialUrl = materialUrl;
    expect(parseTrainingSettings(value, value.courseId, policy)).toBeNull();
  });
  it("rejects unsafe links even if mistakenly allowlisted", () => {
    const value = setting(); value.days[0].materialUrl = material + "?token=secret";
    expect(parseTrainingSettings(value, value.courseId, { ...policy, materialUrls: [value.days[0].materialUrl] })).toBeNull();
  });
  it("rejects a quiz for another course", () => {
    const value = setting(); value.days[0].quizUrl = "https://canvas.example.test/courses/99/quizzes/34";
    expect(parseTrainingSettings(value, value.courseId, policy)).toBeNull();
  });
});

describe("training home states", () => {
  it("keeps absent settings in legacy mode", () => {
    expect(trainingHome(null, "lti-context-12", policy)).toEqual({ state: "legacy" });
  });
  it("never treats a read error as absent settings", () => {
    expect(trainingHome(undefined, "lti-context-12", policy).state).toBe("error");
  });
  it("requires a verified course even for absent settings", () => {
    expect(trainingHome(null, "", policy).state).toBe("error");
  });
  it("keeps explicit legacy mode", () => {
    expect(trainingHome({ ...setting(), mode: "legacy" }, "lti-context-12", policy).state).toBe("legacy");
  });
  it("does not guess a day", () => {
    expect(trainingHome({ ...setting(), currentDay: null }, "lti-context-12", policy).state).toBe("unselected");
  });
  it("permits an empty BtoB course without selecting day one", () => {
    expect(trainingHome({ ...setting(), currentDay: null, days: [] }, "lti-context-12", policy).state).toBe("unselected");
  });
  it("allows a selected lesson with both links pending", () => {
    const value = { ...setting(), days: [{ day: 1, title: "AI基礎", materialUrl: null, quizUrl: null }] };
    expect(trainingHome(value, value.courseId, policy)).toEqual({ state: "ready", lesson: value.days[0] });
  });
  it("does not expose a different course's lesson", () => {
    expect(trainingHome(setting(), "another-context", policy).state).toBe("error");
  });
});
