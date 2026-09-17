import { defineConfig } from "@playwright/test";
if (process.env.TRAINING_DB_TEST !== "1") throw new Error("Isolated harness required");
for (const name of ["DATABASE_URL", "DATABASE_ADMIN_URL"]) {
  const url = new URL(process.env[name]!);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/aischool_test") throw new Error("Isolated DB required");
}
const port = Number(process.env.LOCAL_E2E_PORT);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid port");
export default defineConfig({
  testDir: "./e2e/f1-foundation", testMatch: "navigation.spec.ts", workers: 1,
  forbidOnly: true, retries: 0, timeout: 60000, expect: { timeout: 20000 },
  use: { baseURL: `http://localhost:${port}`, screenshot: "only-on-failure",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } },
  projects: [
    { name: "nuc", use: { viewport: { width: 1366, height: 768 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: { command: `node node_modules/next/dist/bin/next dev --webpack -H 127.0.0.1 -p ${port}`,
    url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 120000,
    env: { ...process.env, NODE_ENV: "development", DEV_COOKIE_ROLES: "1", NEXT_TELEMETRY_DISABLED: "1" } },
});
