import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertProductionFixtureEnvironment, prepareProductionFixture } from './production-fixture.mjs';
const env = { LOCAL_PRODUCTION_LOAD: '1', DATABASE_ADMIN_URL: 'postgres://fictional@127.0.0.1/aischool_test' };
test('rejects non-isolated or reset-enabled environments', () => {
  for (const changes of [{ LOCAL_PRODUCTION_LOAD: '' }, { DATABASE_ADMIN_URL: 'postgres://example.com/aischool_test' },
    { DATABASE_ADMIN_URL: 'postgres://127.0.0.1/aischool' }, { ALLOW_DEV_RESET: '1' }, { DEV_COOKIE_ROLES: '1' }]) {
    assert.throws(() => assertProductionFixtureEnvironment({ ...env, ...changes }));
  }
});
test('refuses existing data and rolls back before inserting', async () => {
  const calls = [];
  const client = { query: async sql => { calls.push(sql); return { rows: [{ count: '1' }] }; } };
  await assert.rejects(prepareProductionFixture(client, env));
  assert.equal(calls.at(-1), 'ROLLBACK');
  assert.equal(calls.some(sql => sql.startsWith('INSERT')), false);
});
test('creates 16 identities and 64 independent allocations without deletion', async () => {
  const calls = [];
  const client = { query: async (sql, values) => { calls.push({ sql, values }); return { rows: [{ count: '0' }] }; } };
  await prepareProductionFixture(client, env);
  assert.equal(calls.filter(c => c.sql.startsWith('INSERT INTO students ')).length, 16);
  assert.equal(calls.filter(c => c.sql.startsWith('INSERT INTO submissions')).length, 64);
  assert.equal(calls.some(c => /DELETE|TRUNCATE|DROP/.test(c.sql)), false);
  assert.equal(calls.at(-1).sql, 'COMMIT');
});
