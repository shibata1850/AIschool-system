import { describe, expect, it } from "vitest";
import { AiGrader } from "../grading";
import type { AiClient } from "../../ai/types";

const assignment = { id: "a1", title: "Test", description: "Test", charLimit: 4000, deadline: "2027-03-31" };
const valid = { totalScore: 90, feedback: "Clear instructions", rationale: "Audience and constraints are specified" };
const grade = (content: string) => new AiGrader({ provider: "mock", complete: async () => ({ content, model: "test" }) } satisfies AiClient).grade(assignment, "Fictional prompt");

describe("grading response regression", () => {
  it("accepts uppercase fences and surrounding whitespace", async () => {
    expect((await grade(" \n```JSON\n" + JSON.stringify(valid) + "\n```\n ")).totalScore).toBe(90);
  });
  it("preserves braces inside feedback strings", async () => {
    const feedback = "Specify an output format such as {name: value}";
    expect((await grade(JSON.stringify({ ...valid, feedback }))).feedback).toBe(feedback);
  });
  it.each([{ ...valid, rationale: "\n " }, { feedback: valid.feedback, rationale: valid.rationale }, { totalScore: 90, rationale: valid.rationale }, { totalScore: 90, feedback: valid.feedback }])("rejects missing fields and blank rationale", async (value) => {
    await expect(grade(JSON.stringify(value))).rejects.toThrow();
  });
  it("rejects multiple fenced objects without disclosing response content", async () => {
    const fence = "```json\n" + JSON.stringify(valid) + "\n```";
    await expect(grade(fence + "\n" + fence)).rejects.toThrow("AI採点の応答形式が不正です（JSON）");
  });
  it.each([JSON.stringify(valid), "```json\n" + JSON.stringify(valid) + "\n```", "```\r\n" + JSON.stringify(valid) + "\r\n```"])("accepts plain JSON or one complete code fence", async (content) => {
    expect((await grade(content)).totalScore).toBe(90);
  });
  it.each([null, [], { ...valid, totalScore: "90" }, { ...valid, totalScore: 90.5 }, { ...valid, totalScore: -1 }, { ...valid, totalScore: 101 }, { ...valid, feedback: null }, { ...valid, rationale: 1 }, { ...valid, feedback: " " }])("rejects invalid response schema", async (value) => {
    await expect(grade(JSON.stringify(value))).rejects.toThrow();
  });
  it.each([0, 100])("accepts score boundary %s", async (totalScore) => {
    expect((await grade(JSON.stringify({ ...valid, totalScore }))).totalScore).toBe(totalScore);
  });
  it.each(["PRIVATE_RESPONSE", '```json\n{"PRIVATE_RESPONSE":', "explanation\n" + JSON.stringify(valid), "```json\n" + JSON.stringify(valid) + "\n```\nextra"])("rejects malformed response without disclosing content", async (content) => {
    await expect(grade(content)).rejects.toThrow("AI採点の応答形式が不正です（JSON）");
  });
});
