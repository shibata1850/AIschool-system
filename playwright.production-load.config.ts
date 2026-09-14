import { defineConfig } from "@playwright/test";
import base from "./playwright.grading.config";

if (process.env.LOCAL_PRODUCTION_LOAD !== "1" || !process.env.LTI_SESSION_SECRET ||
    process.env.ALLOW_DEV_RESET || process.env.DEV_COOKIE_ROLES) {
  throw new Error("Use the isolated production load harness without development permissions");
}
const port = Number(process.env.LOCAL_E2E_PORT);
export default defineConfig({
  ...base,
  testMatch: "2026-09-11-production-load.spec.ts",
  timeout: 300_000,
  projects: [{ name: "production-load", use: { viewport: { width: 1920, height: 1080 } } }],
  reporter: [["list"], ["json", { outputFile: "test-results/production-load-report.json" }]],
  webServer: {
    command: `node node_modules/next/dist/bin/next start -H 127.0.0.1 -p ${port}`,
    url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 120_000,
    env: { ...process.env, NODE_ENV: "production", DEV_COOKIE_ROLES: "", ALLOW_DEV_RESET: "", NEXT_TELEMETRY_DISABLED: "1" },
  },
});
