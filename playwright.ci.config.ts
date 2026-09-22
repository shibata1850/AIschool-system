import { defineConfig } from "@playwright/test";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import base from "./playwright.config";

const mode = process.env.CI_LTI_MODE;
if (mode !== "demo" && mode !== "signed" && mode !== "tutor") throw new Error("Choose demo, signed or tutor CI mode");
if (process.env.TRAINING_DB_TEST !== "1" || !process.env.LTI_SESSION_SECRET) {
  throw new Error("Isolated CI environment required");
}
for (const key of ["DATABASE_URL", "DATABASE_ADMIN_URL"]) {
  const url = new URL(process.env[key]!);
  if (url.hostname !== "127.0.0.1" || url.port !== "55442" || url.pathname !== "/aischool_test") {
    throw new Error("Disposable CI database required");
  }
}
if (process.env.LTI_TOOL_URL !== "http://localhost:3000") throw new Error("Local CI origin required");
const server = base.webServer;
if (!server || Array.isArray(server)) throw new Error("Single base server required");

// These existing cases use signed-session helpers. The complementary demo group
// still checks missing LTI configuration and development role cookies.
const signedCases = /(?:f1-foundation[\\/]devices\.spec\.ts|f4-dashboard[\\/]weekly-report\.spec\.ts|security[\\/]retention\.spec\.ts|chat-log-and-message\.spec\.ts.*LOG-A1 |integration-mastery\.spec\.ts.*E7-A2 |2026-07-03-night-review\.spec\.ts.*指摘#3: デバイス切替)/;
// This suite inspects the request sent through the Claude provider adapter.
const tutorCases = /2026-09-15-tutor-concise\.spec\.ts/;
const isolatedCases = new RegExp(`${signedCases.source}|${tutorCases.source}`);
const tutor = mode === "tutor";
if (tutor) {
  const provider = new URL(process.env.ANTHROPIC_BASE_URL!);
  if (provider.protocol !== "http:" || provider.hostname !== "127.0.0.1" || !provider.port) {
    throw new Error("Loopback tutor fixture required");
  }
}

// The existing demonstration records are dated October 2026. Advance both the
// test worker and its isolated server from the same calendar, never production.
const clock = resolve("tools/training/legacy-clock.cjs").replaceAll("\\", "/");
createRequire(resolve("playwright.ci.config.ts"))(clock);
const signed = mode === "signed";
export default defineConfig({
  ...base,
  grep: signed ? signedCases : tutor ? tutorCases : undefined,
  grepInvert: mode === "demo" ? isolatedCases : undefined,
  maxFailures: 1,
  timeout: 120000,
  expect: { timeout: 15000 },
  outputDir: `test-results/${mode}`,
  webServer: {
    ...server,
    command: "node node_modules/next/dist/bin/next dev --webpack -H 127.0.0.1 -p 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
    env: {
      ...server.env,
      NODE_ENV: "development",
      NODE_OPTIONS: `--require "${clock}"`,
      AI_PROVIDER: tutor ? "claude" : "mock",
      ANTHROPIC_BASE_URL: tutor ? process.env.ANTHROPIC_BASE_URL! : "",
      ANTHROPIC_API_KEY: tutor ? "fictional-ci-tutor-key" : "",
      ANTHROPIC_MODEL: tutor ? "local-fixture" : "",
      DEV_COOKIE_ROLES: signed ? "" : "1",
      ALLOW_DEV_RESET: "",
      DEMO_RICH_SEED: "",
      LTI_ISSUER: signed ? "http://localhost:3000/fictional-canvas" : "",
      LTI_CLIENT_ID: signed ? "fictional-ci-client" : "",
      LTI_AUTH_URL: signed ? "http://localhost:3000/unused-auth" : "",
      LTI_JWKS_URL: signed ? "http://localhost:3000/unused-jwks" : "",
      LTI_TOKEN_URL: "",
      LTI_DEPLOYMENT_ID: "",
      LTI_TOOL_URL: signed ? "http://localhost:3000" : "",
    },
  },
});
