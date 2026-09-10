import { defineConfig } from "@playwright/test";

// This configuration must only be invoked by the isolated local DB harness.
if (process.env.LOCAL_GRADING_E2E !== "1") throw new Error("Use the isolated local E2E harness");
for (const name of ["DATABASE_URL", "DATABASE_ADMIN_URL", "ANTHROPIC_BASE_URL"]) {
  const url = new URL(process.env[name] ?? "");
  if (url.hostname !== "127.0.0.1") throw new Error(`${name} must be loopback-only`);
  if (name.startsWith("DATABASE") && url.pathname !== "/aischool_test") throw new Error("Test DB required");
}
const port = Number(process.env.LOCAL_E2E_PORT);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid local port");

export default defineConfig({
  testDir: "./e2e/regression",
  testMatch: "2026-09-10-grading-json.spec.ts",
  workers: 1, fullyParallel: false, retries: 0, forbidOnly: true,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["json", { outputFile: "test-results/grading-report.json" }]],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure", screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : undefined,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1920, height: 1080 } } },
    { name: "monitor", use: { viewport: { width: 1366, height: 768 } } },
  ],
  webServer: {
    command: `node node_modules/next/dist/bin/next dev --webpack -H 127.0.0.1 -p ${port}`,
    url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 120_000,
    env: { ...process.env, NODE_ENV: "development", DEV_COOKIE_ROLES: "1", NEXT_TELEMETRY_DISABLED: "1" },
  },
});
