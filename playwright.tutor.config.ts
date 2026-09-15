import { defineConfig } from "@playwright/test";
import isolated from "./playwright.grading.config";

export default defineConfig({
  ...isolated,
  testDir: "./e2e",
  testMatch: ["regression/2026-09-15-tutor-concise.spec.ts", "regression/2026-09-15-tutor-timing.spec.ts", "f2-ai-tutor/f2.spec.ts"],
  reporter: [["list"], ["json", { outputFile: "test-results/tutor-report.json" }]],
  projects: [
    { name: "desktop", use: { viewport: { width: 1920, height: 1080 } } },
    { name: "monitor", use: { viewport: { width: 1366, height: 768 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
