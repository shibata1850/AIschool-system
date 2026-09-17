import { defineConfig } from "@playwright/test";
if (process.env.TRAINING_DB_TEST !== "1" || !process.env.LTI_SESSION_SECRET) throw new Error("Isolated harness required");
for (const key of ["DATABASE_URL", "DATABASE_ADMIN_URL"]) {
  const url = new URL(process.env[key]!);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/aischool_test") throw new Error("Isolated DB required");
}
const port = Number(process.env.LOCAL_E2E_PORT);
const production = process.env.TRAINING_PRODUCTION_TEST === "1";
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid port");
export default defineConfig({
  testDir: "./e2e/regression", testMatch: "2026-09-16-training.spec.ts", workers: 1,
  forbidOnly: true, retries: 0, timeout: 60000, expect: { timeout: 20000 },
  use: { baseURL: `http://localhost:${port}`, screenshot: "only-on-failure",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } },
  projects: [
    { name: "nuc", use: { viewport: { width: 1366, height: 768 } } },
    { name: "quest", use: { viewport: { width: 1440, height: 900 } } },
    { name: "nearhub", use: { viewport: { width: 1920, height: 1080 }, hasTouch: true } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: { command: `node node_modules/next/dist/bin/next ${production ? "start" : "dev --webpack"} -H 127.0.0.1 -p ${port}`,
    url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 120000,
    env: { ...process.env, NODE_ENV: production ? "production" : "development", DEV_COOKIE_ROLES: "", ALLOW_DEV_RESET: "", NEXT_TELEMETRY_DISABLED: "1" } },
});
