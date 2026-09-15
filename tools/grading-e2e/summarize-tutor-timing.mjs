import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const method = 'playwright-click-to-visible-upper-bound-v1';

export function summarizeTutorTiming(report) {
  if (!report || !Array.isArray(report.suites)) throw new Error('Invalid Playwright report');
  const groups = new Map();
  function visit(suite) {
    for (const child of suite.suites ?? []) visit(child);
    for (const spec of suite.specs ?? []) {
      if (!spec.title?.startsWith('concise tutor policy reaches provider:')) continue;
      for (const test of spec.tests ?? []) {
        const project = test.projectName || 'unknown';
        if (!groups.has(project)) groups.set(project, []);
        const results = test.results ?? [];
        // Keep the first attempt, including failures; retries cannot improve the sample.
        const first = results[0];
        let elapsedMs = null;
        if (first?.status === 'passed') {
          const attachments = (first.attachments ?? []).filter(a => a.name === 'tutor-visible-timing');
          if (attachments.length === 1 && typeof attachments[0].body === 'string') {
            try {
              const data = JSON.parse(Buffer.from(attachments[0].body, 'base64').toString('utf8'));
              if (data.method === method && data.environment === 'isolated-local-fixture' &&
                  data.acceptance === 'not-evaluated' && Number.isFinite(data.elapsedMs) && data.elapsedMs >= 0) {
                elapsedMs = data.elapsedMs;
              }
            } catch { /* Invalid evidence remains in the denominator, without a timing. */ }
          }
        }
        groups.get(project).push({ elapsedMs, retried: results.length > 1 });
      }
    }
  }
  visit(report);
  return {
    method,
    environment: 'isolated-local-fixture',
    acceptance: 'not-evaluated',
    reason: 'Local DOM visibility timings are not production paint measurements.',
    reportErrors: Array.isArray(report.errors) ? report.errors.length : 0,
    projects: [...groups].map(([project, samples]) => {
      const times = samples.flatMap(s => s.elapsedMs === null ? [] : [s.elapsedMs]);
      return {
        project,
        attempted: samples.length,
        measured: times.length,
        missingOrFailed: samples.length - times.length,
        retried: samples.filter(s => s.retried).length,
        within5000Ms: times.filter(ms => ms <= 5000).length,
        maxMs: times.length ? Math.max(...times) : null,
        meanMs: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
      };
    }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Expected one report path');
    const report = JSON.parse(await readFile(process.argv[2], 'utf8'));
    console.log(JSON.stringify(summarizeTutorTiming(report), null, 2));
  } catch {
    console.error('Unable to summarize timing report: invalid or unreadable input.');
    process.exitCode = 1;
  }
}
