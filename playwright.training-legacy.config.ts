import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
import { resolve } from "node:path";
import { createRequire } from "node:module";
if (process.env.TRAINING_DB_TEST !== "1") throw new Error("Isolated harness required");
for (const name of ["DATABASE_URL", "DATABASE_ADMIN_URL"]) {
  const url = new URL(process.env[name]!);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/aischool_test") throw new Error("Isolated DB required");
}
const port = Number(process.env.LOCAL_E2E_PORT);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid port");
// Keep test expectations and the isolated server on the same advancing calendar.
createRequire(resolve("playwright.training-legacy.config.ts"))("./tools/training/legacy-clock.cjs");
export default defineConfig({
  ...base,
  // The harness first runs device, retention and weekly-report cases with signed LTI sessions.
  testIgnore: [...(base.testIgnore as string[]), "**/f1-foundation/devices.spec.ts", "**/f4-dashboard/weekly-report.spec.ts", "**/security/retention.spec.ts", "**/2026-09-15-tutor-concise.spec.ts", "**/2026-09-15-tutor-timing.spec.ts"],
  globalSetup: "./tools/training/legacy-setup.ts",
  maxFailures: 1,
  // Some existing cases visit every teacher screen in one test; allow local dev compilation.
  timeout: 120000,
  grep: process.env.TRAINING_E2E_GREP ? new RegExp(process.env.TRAINING_E2E_GREP) : undefined,
  grepInvert: /(?:LOG-A1 |E7-A2 |指摘#3: デバイス切替)/,
  use: { ...base.use, baseURL: `http://localhost:${port}` },
  webServer: { ...base.webServer,
    command: `node node_modules/next/dist/bin/next dev --webpack -H 127.0.0.1 -p ${port}`,
    url: `http://127.0.0.1:${port}`, reuseExistingServer: false,
    env: { ...(base.webServer as { env: Record<string, string> }).env, NODE_ENV: "development", AI_PROVIDER: "mock",
      NODE_OPTIONS: `--require "${resolve("tools/training/legacy-clock.cjs").replaceAll("\\", "/")}"`,
    },
  },
});
