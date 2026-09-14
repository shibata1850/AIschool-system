import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasFixture } from './canvas-fixture.mjs';

async function call(handle, url, method = 'GET', body, authorized = true) {
  let result;
  const req = { url, method, headers: authorized ? { authorization: 'Bearer fictional-local-canvas-token' } : {},
    async *[Symbol.asyncIterator]() { if (body) yield JSON.stringify(body); } };
  const res = { statusCode: 200, end(text) { result = JSON.parse(text); } };
  const handled = await handle(req, res);
  return { handled, status: res.statusCode, body: result };
}
test('fixture resolves only known LTI contexts and requires its fictional token', async () => {
  const handle = createCanvasFixture();
  const result = await call(handle, '/api/v1/courses/lti_context_id:fictional-course-a?include[]=lti_context_id');
  assert.equal(result.body.id, 7);
  assert.equal(result.body.lti_context_id, 'fictional-course-a');
  assert.equal((await call(handle, '/api/v1/courses')).status, 404);
  assert.equal((await call(handle, '/api/v1/courses/7/assignments', 'GET', undefined, false)).status, 401);
});
test('fixture records only a matching course, assignment and learner', async () => {
  const handle = createCanvasFixture();
  assert.equal((await call(handle, '/api/v1/courses/7/assignments/901/submissions/501', 'PUT', { submission: { posted_grade: '90' } })).status, 200);
  assert.equal((await call(handle, '/api/v1/courses/7/assignments/999/submissions/501', 'PUT', { submission: { posted_grade: '90' } })).status, 404);
  assert.equal((await call(handle, '/api/v1/courses/7/assignments/901/submissions/601', 'PUT', { submission: { posted_grade: '90' } })).status, 404);
  assert.deepEqual((await call(handle, '/canvas-fixture/state')).body.grades, [{ courseId: 7, assignmentId: 901, userId: 501, score: 90 }]);
  await call(handle, '/canvas-fixture/reset', 'POST');
  assert.deepEqual((await call(handle, '/canvas-fixture/state')).body.grades, []);
});
test('fixture leaves AI requests to the existing harness', async () => {
  assert.equal((await call(createCanvasFixture(), '/v1/messages', 'POST')).handled, false);
});

test('account catalog includes a course with no LTI launch context', async () => {
  const handle = createCanvasFixture();
  assert.deepEqual((await call(handle, '/api/v1/accounts/self/courses')).body.map(course => course.id), [7, 8, 9]);
  assert.equal((await call(handle, '/api/v1/courses/9/users')).body[0].name, 'Fictional Canvas learner C');
  assert.equal((await call(handle, '/api/v1/courses/lti_context_id:fictional-course-c')).status, 404);
  assert.equal((await call(handle, '/api/v1/accounts/self/courses', 'GET', undefined, false)).status, 401);
});
