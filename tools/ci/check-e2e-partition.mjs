import { spawnSync } from "node:child_process";

// List tests only. These fictional values do not open a connection or launch an app.
const env = {
  ...process.env,
  NODE_ENV: "test",
  TRAINING_DB_TEST: "1",
  DATABASE_URL: "postgres://aischool_app:fixture-only-list@127.0.0.1:55442/aischool_test",
  DATABASE_ADMIN_URL: "postgres://aischool_admin:fixture-only-list@127.0.0.1:55442/aischool_test",
  LTI_TOOL_URL: "http://localhost:3000",
  LTI_SESSION_SECRET: "fictional-list-only-session-key-not-used-to-sign-anything",
};
function list(config, mode) {
  const result = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--list", "--reporter=json", "--config", config], {
    env: { ...env, CI_LTI_MODE: mode ?? "" }, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`Cannot list ${config}: ${result.stderr || result.stdout}`);
  const report = JSON.parse(result.stdout);
  if (report.errors?.length) throw new Error("Test discovery reported errors");
  const keys = [];
  function visit(suite, parents = []) {
    const titles = [...parents, suite.title];
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) keys.push(JSON.stringify([spec.file.replaceAll("\\", "/"), spec.line, titles, spec.title, test.projectName]));
    }
    for (const child of suite.suites ?? []) visit(child, titles);
  }
  for (const suite of report.suites) visit(suite);
  if (keys.length !== new Set(keys).size) throw new Error("Duplicate test keys");
  return new Set(keys);
}
const baseline = list("playwright.config.ts");
const demo = list("playwright.ci.config.ts", "demo");
const signed = list("playwright.ci.config.ts", "signed");
const combined = new Set([...demo, ...signed]);
const missing = [...baseline].filter(key => !combined.has(key));
const extra = [...combined].filter(key => !baseline.has(key));
const overlap = [...demo].filter(key => signed.has(key));
if (!demo.size || !signed.size || missing.length || extra.length || overlap.length) {
  throw new Error(JSON.stringify({ missing, extra, overlap }));
}
console.log(JSON.stringify({ baseline: baseline.size, demo: demo.size, signed: signed.size, missing: 0, extra: 0, overlap: 0 }));
