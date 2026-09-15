import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { writeFile, unlink, readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
import { prepareProductionFixture } from './production-fixture.mjs';
import { createCanvasFixture } from './canvas-fixture.mjs';
import { createTutorFixture } from './tutor-fixture.mjs';

const baseline = process.argv.includes('--baseline');
const tutor = process.argv.includes('--tutor');
if (tutor && (!process.argv.includes('--e2e') || ['--baseline', '--attendance', '--course-isolation', '--production-load'].some(flag => process.argv.includes(flag)))) {
  throw new Error('--tutor requires --e2e without other suite flags');
}
const attendance = process.argv.includes('--attendance');
if (attendance && (!process.argv.includes('--e2e') || baseline || process.argv.includes('--course-isolation') || process.argv.includes('--production-load'))) {
  throw new Error('--attendance requires --e2e without other suite flags');
}
const productionLoad = process.argv.includes('--production-load');
if (productionLoad && (baseline || !process.argv.includes('--e2e') || !process.argv.includes('--course-isolation'))) {
  throw new Error('--production-load requires --e2e --course-isolation without --baseline');
}
const courseIsolation = process.argv.includes('--course-isolation');
if (courseIsolation && (baseline || !process.argv.includes('--e2e'))) throw new Error('--course-isolation requires --e2e without --baseline');
if (baseline) throw new Error('Baseline comparison uses a separate historical checkout and harness');
if (baseline && !process.argv.includes('--e2e')) throw new Error('--baseline requires --e2e');
const repo = resolve('../..');
for (const file of ['.env', '.env.local', '.env.development', '.env.development.local', '.env.test', '.env.test.local', '.env.production', '.env.production.local']) {
  if (existsSync(resolve(repo, file))) throw new Error(`Unexpected ${file}; stopped`);
}
const e2e = process.argv.includes('--e2e');
const port = await new Promise((resolvePort, reject) => {
  const server = net.createServer();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    server.close(() => resolvePort(port));
  });
});
const password = randomBytes(24).toString('hex');
const dataDir = resolve('local-pg-' + Date.now());
const bin = resolve('node_modules/@embedded-postgres/windows-x64/native/bin');
const passwordFile = resolve('local-pg-password-' + Date.now());
let started = false;
async function native(name, args) {
  await new Promise((done, reject) => {
    const child = spawn(resolve(bin, name + '.exe'), args, { env: { ...process.env, LC_ALL: 'C', LC_MESSAGES: 'C', LANGUAGE: 'C' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => process.stdout.write(data.toString().replaceAll(password, '[REDACTED]')));
    child.on('error', reject);
    child.on('exit', code => code === 0 ? done() : reject(new Error(`${name} exit=${code}`)));
  });
}
const url = (role) => `postgresql://${role}:${password}@127.0.0.1:${port}/aischool_test`;
const env = { ...process.env, DATABASE_URL: url('aischool_app'), DATABASE_ADMIN_URL: url('aischool_admin'), AI_PROVIDER: 'mock', CANVAS_BASE_URL: '', CANVAS_API_TOKEN: '', ANTHROPIC_API_KEY: '' };
for (const name of Object.keys(env)) if (/^(LTI_|JUPYTER_|ANTHROPIC_|CANVAS_)/.test(name)) env[name] = '';
env.DEMO_RICH_SEED = '';
env.ALLOW_DEV_RESET = '';
env.DEV_COOKIE_ROLES = '';
env.LOCAL_PRODUCTION_LOAD = productionLoad ? '1' : '';
env.NEXT_TELEMETRY_DISABLED = '1';
let fixture;
async function startFixture() {
  let seen = false;
  const canvasFixture = createCanvasFixture();
  const tutorFixture = createTutorFixture();
  fixture = http.createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (tutor && await tutorFixture(req, res)) return;
    if (courseIsolation && await canvasFixture(req, res)) return;
    if (req.url === '/seen-invalid') return res.end(JSON.stringify({ seen }));
    if (req.url === '/reset-fixture') { seen = false; return res.end('{}'); }
    if (req.method !== 'POST' || req.url !== '/v1/messages') { res.statusCode = 404; return res.end('{}'); }
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const input = JSON.parse(body);
      const text = input.messages.map(m => m.content).join('\n');
      const totalScore = text.includes('E2E_ZERO') ? 0 : text.includes('E2E_HUNDRED') ? 100 : 90;
      let output = JSON.stringify({ totalScore, feedback: '\u5bfe\u8c61\u8aad\u8005\u304c\u660e\u78ba\u3067\u3059\u3002', rationale: 'Fictional test response' });
      if (text.includes('E2E_FENCE')) output = '```json\n' + output + '\n```';
      if (text.includes('E2E_INVALID')) { output = '```json\n{"unfinished":'; seen = true; }
      if (text.includes('E2E_BUDGET') && input.max_tokens < 1200) output = '{"unfinished":';
      res.end(JSON.stringify({ id: 'msg_local_test', type: 'message', role: 'assistant', model: input.model, content: [{ type: 'text', text: output }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }));
    } catch { res.statusCode = 400; res.end('{}'); }
  });
  await new Promise((done, reject) => { fixture.on('error', reject); fixture.listen(0, '127.0.0.1', done); });
  env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${fixture.address().port}`;
  env.ANTHROPIC_API_KEY = 'fictional-local-e2e-key';
  env.ANTHROPIC_MODEL = 'local-fixture';
  env.AI_PROVIDER = 'claude';
  env.LOCAL_GRADING_E2E = '1';
  if (courseIsolation) {
    env.LOCAL_COURSE_ISOLATION = '1';
    env.LTI_SESSION_SECRET = randomBytes(48).toString('hex');
  }
  env.LOCAL_E2E_PORT = String(await new Promise((done, reject) => {
    const server = net.createServer(); server.on('error', reject);
    server.listen(0, '127.0.0.1', () => { const p = server.address().port; server.close(() => done(p)); });
  }));
  if (courseIsolation) {
    env.CANVAS_BASE_URL = env.ANTHROPIC_BASE_URL;
    env.CANVAS_API_TOKEN = 'fictional-local-canvas-token';
    env.LTI_ISSUER = env.CANVAS_BASE_URL;
    env.LTI_CLIENT_ID = 'fictional-client';
    env.LTI_AUTH_URL = env.CANVAS_BASE_URL + '/unused-authorize';
    env.LTI_JWKS_URL = env.CANVAS_BASE_URL + '/unused-jwks';
    env.LTI_TOOL_URL = `http://localhost:${env.LOCAL_E2E_PORT}`;
  }
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  if (!env.PLAYWRIGHT_CHROMIUM_PATH && existsSync(edge)) env.PLAYWRIGHT_CHROMIUM_PATH = edge;
}
async function run(args, allowTestFailure = false) {
  return await new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, args, { cwd: repo, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => process.stdout.write(data.toString().replaceAll(password, '[REDACTED]')));
    child.on('error', reject);
    child.on('exit', code => code === 0 || (allowTestFailure && code === 1) ? resolveRun(code) : reject(new Error(`Test command exit=${code}`)));
  });
}
try {
  await writeFile(passwordFile, password, { flag: 'wx', mode: 0o600 });
  try {
    await native('initdb', ['-D', dataDir, '-U', 'aischool_admin', '--auth=scram-sha-256', '--pwfile=' + passwordFile, '--encoding=UTF8', '--locale=C']);
  } finally { await unlink(passwordFile); }
  await native('pg_ctl', ['-D', dataDir, '-l', dataDir + '/server.log', '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
  started = true;
  const client = new pg.Client({ host: '127.0.0.1', port, user: 'aischool_admin', password, database: 'postgres' });
  await client.connect();
  try {
    await client.query('CREATE DATABASE aischool_test');
    await client.query(`CREATE ROLE aischool_app WITH LOGIN PASSWORD ${client.escapeLiteral(password)}`);
  } finally { await client.end(); }
  console.log('ISOLATED_LOCAL_DB_READY');
  await run(['node_modules/tsx/dist/cli.mjs', 'scripts/migrate.ts']);
  if (e2e) {
    await startFixture();
    if (productionLoad) {
      const fixtureDb = new pg.Client({ connectionString: env.DATABASE_ADMIN_URL });
      await fixtureDb.connect();
      try { await prepareProductionFixture(fixtureDb, env); }
      finally { await fixtureDb.end(); }
      env.NODE_ENV = 'production';
      await run(['node_modules/next/dist/bin/next', 'build', '--webpack']);
    }
    const startedAt = Date.now();
    const args = ['node_modules/@playwright/test/cli.js', 'test', productionLoad ? '--config=playwright.production-load.config.ts' : courseIsolation ? '--config=playwright.course-isolation.config.ts' : '--config=playwright.grading.config.ts'];
    if (attendance) args[2] = '--config=playwright.attendance.config.ts';
    if (tutor) args[2] = '--config=playwright.tutor.config.ts';
    if (baseline) args.push('--grep', 'AI grading (FENCE|PLAIN)');
    const code = await run(args, baseline);
    if (baseline) {
      const reportPath = resolve(repo, 'test-results/grading-report.json');
      if ((await stat(reportPath)).mtimeMs < startedAt) throw new Error('Stale baseline report');
      const report = JSON.parse(await readFile(reportPath, 'utf8'));
      const specs = [];
      const visit = suite => { specs.push(...(suite.specs ?? [])); for (const child of suite.suites ?? []) visit(child); };
      for (const suite of report.suites ?? []) visit(suite);
      const tests = specs.flatMap(spec => spec.tests.map(test => ({ title: spec.title, ...test })));
      const fences = tests.filter(test => test.title.includes('FENCE'));
      const plain = tests.filter(test => test.title.includes('PLAIN'));
      if (code !== 1 || report.errors?.length || tests.length !== 4 || fences.length !== 2 || plain.length !== 2 ||
          !fences.every(test => test.status === 'unexpected' && test.results.at(-1)?.status === 'failed') ||
          !plain.every(test => test.status === 'expected' && test.results.at(-1)?.status === 'passed')) {
        throw new Error('BASELINE_RESULT_NEEDS_REVIEW');
      }
      console.log('BASELINE_REPRODUCED: fenced JSON failed twice; plain JSON passed twice.');
    }
  } else {
    await run(['node_modules/vitest/vitest.mjs', 'run']);
  }
} finally {
  if (fixture) await new Promise(done => fixture.close(done));
  if (started) await native('pg_ctl', ['-D', dataDir, '-m', 'fast', '-w', 'stop']);
  console.log('ISOLATED_LOCAL_DB_STOPPED');
}
