import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTutorTiming } from './summarize-tutor-timing.mjs';

const evidence = (elapsedMs, overrides = {}) => ({
  name: 'tutor-visible-timing',
  body: Buffer.from(JSON.stringify({
    method: 'playwright-click-to-visible-upper-bound-v1',
    environment: 'isolated-local-fixture', acceptance: 'not-evaluated', elapsedMs, ...overrides,
  })).toString('base64'),
});
const passed = (ms, overrides) => ({ status: 'passed', attachments: [evidence(ms, overrides)] });
const report = (...results) => ({ suites: [{ specs: results.map(r => ({
  title: 'concise tutor policy reaches provider: fictional',
  tests: [{ projectName: 'desktop', results: r }],
})) }] });

test('ten fast local samples never become production acceptance', () => {
  const result = summarizeTutorTiming(report(...Array.from({ length: 10 }, () => [passed(200)])));
  assert.equal(result.projects[0].within5000Ms, 10);
  assert.equal(result.acceptance, 'not-evaluated');
});
test('failed first attempt cannot be replaced by a fast retry', () => {
  const result = summarizeTutorTiming(report([{ status: 'timedOut' }, passed(1)]));
  assert.equal(result.projects[0].attempted, 1);
  assert.equal(result.projects[0].missingOrFailed, 1);
  assert.equal(result.projects[0].retried, 1);
  assert.equal(result.projects[0].maxMs, null);
});
test('5000ms boundary and missing measurements remain separate', () => {
  const result = summarizeTutorTiming(report([passed(5000)], [passed(5001)], [{ status: 'passed' }])).projects[0];
  assert.equal(result.attempted, 3);
  assert.equal(result.within5000Ms, 1);
  assert.equal(result.missingOrFailed, 1);
});
test('negative, null, wrong-method and production evidence are not silently accepted', () => {
  const result = summarizeTutorTiming(report([passed(-1)], [passed(null)],
    [passed(1, { method: 'server-F2' })], [passed(1, { environment: 'production' })])).projects[0];
  assert.equal(result.measured, 0);
  assert.equal(result.missingOrFailed, 4);
});
test('malformed or duplicated evidence remains unmeasured', () => {
  const result = summarizeTutorTiming(report(
    [{ status: 'passed', attachments: [{ name: 'tutor-visible-timing', body: 'invalid' }] }],
    [{ status: 'passed', attachments: [evidence(1), evidence(2)] }],
  )).projects[0];
  assert.equal(result.missingOrFailed, 2);
});
test('empty report cannot produce a zero-millisecond result', () => {
  assert.deepEqual(summarizeTutorTiming({ suites: [] }).projects, []);
  assert.throws(() => summarizeTutorTiming({}));
});
test('output excludes question text and attachment contents', () => {
  const input = report([passed(100, { secret: 'do-not-copy' })]);
  input.suites[0].specs[0].title += ' confidential-question';
  const output = JSON.stringify(summarizeTutorTiming(input));
  assert.ok(!output.includes('do-not-copy'));
  assert.ok(!output.includes('confidential-question'));
});
