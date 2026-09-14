import base from "./playwright.grading.config";

if (process.env.LOCAL_COURSE_ISOLATION !== "1" || !process.env.LTI_SESSION_SECRET) {
  throw new Error("Use the isolated course test harness");
}

export default {
  ...base,
  testMatch: ["2026-09-11-course-isolation.spec.ts", "2026-09-11-canvas-links.spec.ts"],
  projects: base.projects?.map((project) => ({
    ...project,
    // The grading suite's mobile filter must not exclude course regressions.
    testMatch: ["2026-09-11-course-isolation.spec.ts", "2026-09-11-canvas-links.spec.ts"],
  })),
  reporter: [["list"], ["json", { outputFile: "test-results/course-isolation-report.json" }]],
};
