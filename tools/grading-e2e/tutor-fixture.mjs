// Local transport fixture, not a test of a real model's instruction following.
export function createTutorFixture() {
  let latest = null;
  return async (req, res) => {
    if (req.url === '/tutor-request') {
      res.end(JSON.stringify(latest));
      return true;
    }
    if (req.method !== 'POST' || req.url !== '/v1/messages') return false;
    let body = '';
    for await (const chunk of req) body += chunk;
    latest = JSON.parse(body);
    res.end(JSON.stringify({
      id: 'msg_tutor_fixture', type: 'message', role: 'assistant', model: latest.model,
      content: [{ type: 'text', text: '目的と必要な条件を整理してください。\n\n判断に迷う場合は、講師に確認してください。' }],
      stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    }));
    return true;
  };
}
