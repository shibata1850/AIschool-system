import { describe, it, expect } from "vitest";
import { projectUrl, shortText } from "../policy";
import { parseTrainingSettings } from "@/lib/course/trainingPolicy";

describe("development course input", () => {
  it.each(["javascript:alert(1)", "http://example.com", "https://user:secret@example.com", "https://example.com/?token=secret", "https://example.com/#token", "https://localhost", "https://example.com/ bad", "https://example.com\\secret"])("rejects unsafe project link %s", value => {
    expect(projectUrl(value)).toBeUndefined();
  });
  it("allows optional links and plain HTTPS links", () => {
    expect(projectUrl(null)).toBeNull(); expect(projectUrl("")).toBeNull();
    expect(projectUrl("https://example.com/project")).toBe("https://example.com/project");
  });
  it("bounds notes and rejects control characters", () => {
    expect(shortText("a\nb", 3)).toBe(true);
    expect(shortText("a\u0000b", 3)).toBe(false);
    expect(shortText("abcd", 3)).toBe(false);
  });
  it("keeps optional learning material independent of quizzes", () => {
    const input = { courseId: "fictional", mode: "development", revision: 0, currentDay: 1,
      days: [{ day: 1, title: "自社の困りごと", materialUrl: null, quizUrl: null, quizRequired: false,
        referenceUrl: "https://example.com/reference", supplementUrl: null }] };
    const policy = { materialUrls: ["https://example.com/reference"], quizUrls: [] };
    expect(parseTrainingSettings(input, "fictional", policy)?.mode).toBe("development");
    expect(parseTrainingSettings(input, "fictional", { materialUrls: [], quizUrls: [] })).toBeNull();
  });
});
