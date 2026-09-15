import { defineConfig } from "@playwright/test";
import base from "./playwright.grading.config";

if (process.env.LOCAL_PRODUCTION_LOAD === "1" || process.env.LOCAL_COURSE_ISOLATION === "1") {
  throw new Error("Attendance suite requires the isolated legacy-role fixture");
}

export default defineConfig({
  ...base,
  testDir: "./e2e/f4-dashboard",
  testMatch: "attendance.spec.ts",
  projects: base.projects?.filter(project => project.name !== "mobile"),
  reporter: [["list"], ["json", { outputFile: "test-results/attendance-report.json" }]],
});
