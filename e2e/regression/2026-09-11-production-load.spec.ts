import { test, expect, type BrowserContext } from "@playwright/test";
import { SignJWT } from "jose";
import pg from "pg";

const dbUrl = new URL(process.env.DATABASE_ADMIN_URL ?? "");
if (process.env.LOCAL_PRODUCTION_LOAD !== "1" || dbUrl.hostname !== "127.0.0.1" ||
    dbUrl.pathname !== "/aischool_test" || !process.env.LTI_SESSION_SECRET) {
  throw new Error("Fresh isolated production load harness required");
}

test("production build serves sixteen independent students", async ({ browser, baseURL, request }) => {
  expect((await request.get("/api/dev/reset")).status()).toBeGreaterThanOrEqual(400);
  const contexts: BrowserContext[] = [];
  const db = new pg.Client({ connectionString: dbUrl.toString() });
  await db.connect();
  try {
    for (let i = 1; i <= 16; i++) {
      const context = await browser.newContext();
      contexts.push(context);
      const token = await new SignJWT({ role: "student", courseId: "production-load-course" })
        .setSubject(`production-load-student-${i}`).setProtectedHeader({ alg: "HS256" })
        .setIssuedAt().setExpirationTime("15m")
        .sign(new TextEncoder().encode(process.env.LTI_SESSION_SECRET));
      await context.addCookies([{ name: "lti_session", value: token, domain: "localhost", path: "/" }]);
    }
    // Probe the production handler with an authenticated teacher; never enable reset.
    const teacher = await new SignJWT({ role: "teacher", courseId: "production-load-course" })
      .setSubject("fictional-load-teacher").setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("15m")
      .sign(new TextEncoder().encode(process.env.LTI_SESSION_SECRET));
    expect((await request.post("/api/dev/reset", { headers: { cookie: `lti_session=${teacher}` } })).status()).toBe(404);
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    for (let round = 0; round < 4; round++) {
      const assignment = `production-load-round-${round}`;
      // Separate authenticated HTML fetching from simultaneous browser rendering.
      const htmlFetch = await Promise.all(contexts.map(async context => {
        const start = Date.now();
        const response = await context.request.get(`${baseURL}/`);
        expect(response.status()).toBe(200);
        await response.body();
        return Date.now() - start;
      }));
      const navigation = await Promise.all(pages.map(async page => {
        const start = Date.now();
        expect((await page.goto(`${baseURL}/`, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
        return Date.now() - start;
      }));
      const browserTiming = await Promise.all(pages.map(page => page.evaluate(() => {
        const timing = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
        return {
          ttfb: timing.responseStart - timing.requestStart,
          htmlTransfer: timing.responseEnd - timing.responseStart,
          afterHtml: Math.max(0, timing.domContentLoadedEventStart - timing.responseEnd),
        };
      })));
      const submission = await Promise.all(contexts.map(async (context, i) => {
        const start = Date.now();
        const response = await context.request.post(`${baseURL}/api/exercises/${assignment}/submit`, {
          headers: { origin: new URL(baseURL!).origin },
          data: { promptText: `Fictional round ${round} student ${i + 1}`, reflectionText: "Fictional reflection", expectedVersion: 1 },
        });
        expect(response.status()).toBe(200);
        return Date.now() - start;
      }));
      const stored = await db.query("SELECT student_id,prompt_text FROM submissions WHERE course_id=$1 AND assignment_id=$2", ["production-load-course", assignment]);
      expect(stored.rows).toHaveLength(16);
      for (let i = 1; i <= 16; i++) {
        expect(stored.rows.find(row => row.student_id === `production-load-student-${i}`)?.prompt_text).toBe(`Fictional round ${round} student ${i}`);
      }
      const summarize = (values: number[]) => {
        const sorted = [...values].sort((a, b) => a - b);
        return { count: sorted.length, p50: sorted[7], p90: sorted[14], max: sorted[15] };
      };
      const navigationStats = summarize(navigation);
      const submissionStats = summarize(submission);
      console.log(JSON.stringify({ environment: "local-production-fixture", method: "html-probe-before-navigation-v1", round,
        htmlFetch: summarize(htmlFetch), browserTtfb: summarize(browserTiming.map(t => t.ttfb)),
        browserHtmlTransfer: summarize(browserTiming.map(t => t.htmlTransfer)),
        browserAfterHtml: summarize(browserTiming.map(t => t.afterHtml)) }));
      console.log(JSON.stringify({ environment: "local-production-fixture", phase: round === 0 ? "warmup" : "measurement", round, navigation: navigationStats, submission: submissionStats, navigationTargetMet: navigationStats.p90 <= 3000, submissionTargetMet: submissionStats.p90 <= 5000 }));
    }
  } finally {
    await Promise.all(contexts.map(context => context.close()));
    await db.end();
  }
});
