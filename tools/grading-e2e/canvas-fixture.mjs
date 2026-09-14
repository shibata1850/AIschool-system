// Loopback-only harness fixture. Never imported by the application.
export function createCanvasFixture() {
  const grades = [];
  const assignment = (id, published = true, points = 100) => ({ id, name: `Fictional Canvas ${id}`,
    published, points_possible: points, description: 'Fictional exercise', due_at: null });
  const targets = { 7: [assignment(900), assignment(901), assignment(902, false), assignment(903, true, 10)],
    8: [assignment(999)], 9: [assignment(1099)] };
  return async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const send = (body, status = 200) => { res.statusCode = status; res.end(JSON.stringify(body)); return true; };
    if (path === '/canvas-fixture/state') return send({ grades });
    if (path === '/canvas-fixture/reset' && req.method === 'POST') { grades.length = 0; return send({}); }
    if (!path.startsWith('/api/v1/')) return false;
    if (req.headers.authorization !== 'Bearer fictional-local-canvas-token') return send({}, 401);
    if (path === '/api/v1/accounts/self/courses' && req.method === 'GET') return send([
      { id: 7, name: 'fictional-course-a' }, { id: 8, name: 'fictional-course-b' },
      { id: 9, name: 'Fictional unlaunched course' },
    ]);
    const context = path.match(/^\/api\/v1\/courses\/lti_context_id:(fictional-course-[ab])$/);
    if (context && req.method === 'GET') return send({ id: context[1].endsWith('-a') ? 7 : 8,
      name: context[1], lti_context_id: context[1] });
    const match = path.match(/^\/api\/v1\/courses\/(7|8|9)\/(.+)$/);
    if (!match) return send({}, 404);
    const courseId = Number(match[1]);
    const tail = match[2];
    if (tail === 'assignments' && req.method === 'GET') return send(targets[courseId]);
    if (tail === 'users' && req.method === 'GET') return send([{ id: (courseId - 2) * 100 + 1, name: `Fictional Canvas learner ${courseId === 7 ? 'A' : courseId === 8 ? 'B' : 'C'}` }]);
    const submissions = tail.match(/^assignments\/(\d+)\/submissions(?:\/(\d+))?$/);
    if (submissions) {
      const assignmentId = Number(submissions[1]);
      if (!targets[courseId].some(item => item.id === assignmentId)) return send({}, 404);
      if (req.method === 'GET' && !submissions[2]) return send([]);
      if (req.method === 'PUT' && submissions[2]) {
        let body = '';
        for await (const chunk of req) body += chunk;
        try {
          const input = JSON.parse(body);
          const userId = Number(submissions[2]);
          if (userId !== (courseId - 2) * 100 + 1) return send({}, 404);
          const score = Number(input.submission.posted_grade);
          grades.push({ courseId, assignmentId, userId, score });
          return send({ id: 1, user_id: userId, score, workflow_state: 'graded', submitted_at: null, late: false });
        } catch { return send({}, 400); }
      }
    }
    return send({}, 404);
  };
}
