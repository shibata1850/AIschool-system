import { defineConfig } from "@playwright/test";
import signed from "./playwright.training.config";
import standard from "./playwright.config";
import { INTEGRATION_TOKEN } from "./e2e/helpers";
const webServer = signed.webServer;
if (!webServer || Array.isArray(webServer)) throw new Error("Single isolated server required");

export default defineConfig({
  ...signed,
  testDir: "./e2e",
  testMatch: ["f1-foundation/devices.spec.ts", "f2-ai-tutor/chat-log-and-message.spec.ts", "f4-dashboard/weekly-report.spec.ts", "f4-dashboard/integration-mastery.spec.ts", "security/retention.spec.ts", "regression/2026-07-03-night-review.spec.ts"],
  grep: /(?:S9-|LOG-A1 |F4-|RET-|E7-A2 |指摘#3: デバイス切替)/,
  webServer: { ...webServer, env: {
    ...webServer.env,
    INTEGRATION_API_TOKEN: INTEGRATION_TOKEN,
  } },
  projects: standard.projects,
  maxFailures: 1,
});
