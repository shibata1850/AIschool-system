import http from "node:http";
import { spawn } from "node:child_process";
import { createTutorFixture } from "../grading-e2e/tutor-fixture.mjs";

// Use the existing local provider fixture only for tests of prompt transport.
// No real AI account or production database is used by this harness.
if (!["demo", "signed", "tutor"].includes(process.env.CI_LTI_MODE) || process.env.TRAINING_DB_TEST !== "1") {
  throw new Error("Choose an isolated CI test mode");
}
for (const key of ["DATABASE_URL", "DATABASE_ADMIN_URL"]) {
  const url = new URL(process.env[key]);
  if (url.hostname !== "127.0.0.1" || url.port !== "55442" || url.pathname !== "/aischool_test") {
    throw new Error("Disposable CI database required");
  }
}
let fixture;
let child;
const env = { ...process.env };
try {
  if (env.CI_LTI_MODE === "tutor") {
    const handle = createTutorFixture();
    fixture = http.createServer(async (req, res) => {
      res.setHeader("content-type", "application/json");
      try {
        if (await handle(req, res)) return;
        res.writeHead(404).end("{}");
      } catch {
        res.writeHead(400).end("{}");
      }
    });
    await new Promise((done, reject) => {
      fixture.once("error", reject);
      fixture.listen(0, "127.0.0.1", done);
    });
    env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${fixture.address().port}`;
  }
  const stop = signal => child?.kill(signal);
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    process.exitCode = await new Promise((done, reject) => {
      child = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config", "playwright.ci.config.ts", ...process.argv.slice(2)], {
        env, stdio: "inherit", windowsHide: true,
      });
      child.once("error", reject);
      child.once("exit", code => done(code ?? 1));
    });
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
  }
} finally {
  if (fixture) {
    fixture.closeAllConnections();
    await new Promise(done => fixture.close(done));
  }
}
