import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { writeFile, unlink, mkdtemp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
if (process.argv.slice(2).some(arg => !['--all', '--e2e', '--navigation', '--production', '--legacy-e2e'].includes(arg))) throw new Error('Unknown option');
if (process.argv.includes('--production') && !process.argv.includes('--e2e')) throw new Error('--production requires --e2e');
if (['--e2e', '--navigation', '--legacy-e2e'].filter(arg => process.argv.includes(arg)).length > 1) throw new Error('Select one browser suite');
const shard = process.env.TRAINING_E2E_SHARD;
if (shard) {
  const match = /^([1-9][0-9]*)\/([1-9][0-9]*)$/.exec(shard);
  if (!match || !Number.isSafeInteger(Number(match[2])) || Number(match[1]) > Number(match[2])) throw new Error('Invalid TRAINING_E2E_SHARD (expected current/total)');
  if (!process.argv.includes('--legacy-e2e') || process.env.TRAINING_E2E_GREP) throw new Error('Sharding requires --legacy-e2e without TRAINING_E2E_GREP');
}
if (!process.env.TRAINING_PG_BIN) throw new Error('Set TRAINING_PG_BIN to your local PostgreSQL bin directory');
const bin = resolve(process.env.TRAINING_PG_BIN);
const suffix = process.platform === 'win32' ? '.exe' : '';
for (const name of ['initdb', 'pg_ctl']) {
  if (!existsSync(resolve(bin, name + suffix))) throw new Error(`Missing PostgreSQL executable: ${name}`);
}
for (const file of ['.env', '.env.local', '.env.test', '.env.test.local', '.env.development', '.env.development.local', '.env.production', '.env.production.local']) {
  if (existsSync(resolve(repo, file))) throw new Error('Environment file present; stopped');
}
const port = await new Promise((done, reject) => {
  const server = net.createServer(); server.on('error', reject);
  server.listen(0, '127.0.0.1', () => { const p = server.address().port; server.close(() => done(p)); });
});
const password = randomBytes(24).toString('hex');
const data = await mkdtemp(resolve(tmpdir(), 'aischool-training-'));
const passwordFile = data + '.password';
const env = { ...process.env, NODE_ENV: 'test', TRAINING_DB_TEST: '1',
  DATABASE_URL: `postgresql://aischool_app:${password}@127.0.0.1:${port}/aischool_test`,
  DATABASE_ADMIN_URL: `postgresql://aischool_admin:${password}@127.0.0.1:${port}/aischool_test` };
for (const key of Object.keys(env)) if (/^(CANVAS_|LTI_|ANTHROPIC_|JUPYTER_|PG)/.test(key)) env[key] = '';
env.AI_PROVIDER = 'mock';
env.DEMO_RICH_SEED = '';
env.ALLOW_DEV_RESET = '';
env.DEV_COOKIE_ROLES = '';
env.NEXT_TELEMETRY_DISABLED = '1';
async function run(command, args, cwd, childEnv = env) {
  await new Promise((done, reject) => {
    const child = spawn(command, args, { cwd, env: childEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => process.stdout.write(chunk.toString().replaceAll(password, '[REDACTED]')));
    child.on('error', reject);
    child.on('exit', code => code === 0 ? done() : reject(new Error(`Process failed (${code})`)));
  });
}
const native = (name, args) => run(resolve(bin, name + suffix), args, repo, {
  ...env, LC_ALL: 'C', LC_MESSAGES: 'C', LANGUAGE: 'C',
});
let started = false;
try {
  await writeFile(passwordFile, password, { flag: 'wx', mode: 0o600 });
  try { await native('initdb', ['-D', data, '-U', 'aischool_admin', '--auth=scram-sha-256', '--pwfile=' + passwordFile, '--encoding=UTF8', '--locale=C']); }
  finally { await unlink(passwordFile); }
  await native('pg_ctl', ['-D', data, '-l', data + '/server.log', '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
  started = true;
  const client = new pg.Client({ host: '127.0.0.1', port, user: 'aischool_admin', password, database: 'postgres' });
  await client.connect();
  try {
    await client.query('CREATE DATABASE aischool_test');
    await client.query(`CREATE ROLE aischool_app WITH LOGIN PASSWORD ${client.escapeLiteral(password)}`);
  } finally { await client.end(); }
  await run(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/migrate.ts'], repo);
  await run(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/migrate.ts'], repo);
  await run(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...(process.argv.includes('--all') ? [] : ['src/lib/course/__tests__/trainingPolicy.test.ts', 'src/lib/course/__tests__/trainingStore.test.ts', 'src/lib/course/__tests__/trainingPersistence.test.ts', 'src/lib/course/__tests__/trainingRoute.test.ts', 'src/lib/course/__tests__/trainingHomeRender.test.ts'])], repo);
  if (process.argv.includes('--e2e') || process.argv.includes('--navigation') || process.argv.includes('--legacy-e2e')) {
    env.LOCAL_E2E_PORT = String(await new Promise((done, reject) => {
      const server = net.createServer(); server.on('error', reject);
      server.listen(0, '127.0.0.1', () => { const p = server.address().port; server.close(() => done(p)); });
    }));
    env.LTI_SESSION_SECRET = randomBytes(48).toString('hex');
    env.LTI_ISSUER = 'https://canvas.example.test';
    env.LTI_CLIENT_ID = 'fictional-training-client';
    env.LTI_AUTH_URL = 'https://canvas.example.test/auth';
    env.LTI_JWKS_URL = 'https://canvas.example.test/jwks';
    env.LTI_TOOL_URL = `http://localhost:${env.LOCAL_E2E_PORT}`;
    env.DEMO_RICH_SEED = '';
    const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    if (!env.PLAYWRIGHT_CHROMIUM_PATH && existsSync(edge)) env.PLAYWRIGHT_CHROMIUM_PATH = edge;
    const navigation = process.argv.includes('--navigation');
    const legacy = process.argv.includes('--legacy-e2e');
    if (legacy) {
      console.log('STANDARD_SUITE_STAGE: signed devices, retention and weekly reports');
      await run(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config=playwright.training-signed.config.ts'], repo);
      console.log('STANDARD_SUITE_STAGE: remaining legacy cases');
    }
    if (navigation || legacy) for (const key of Object.keys(env)) if (key.startsWith('LTI_')) env[key] = '';
    if (process.argv.includes('--production')) {
      env.TRAINING_PRODUCTION_TEST = '1';
      env.NODE_ENV = 'production';
      await run(process.execPath, ['node_modules/next/dist/bin/next', 'build', '--webpack'], repo);
    }
    if (shard) console.log(`STANDARD_SUITE_SHARD: ${shard} (signed cases run in full)`);
    await run(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', legacy ? '--config=playwright.training-legacy.config.ts' : navigation ? '--config=playwright.training-navigation.config.ts' : '--config=playwright.training.config.ts', ...(shard ? [`--shard=${shard}`] : [])], repo);
  }
} finally {
  if (started) await native('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
}
