const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchBotApi } = require('../scripts/lib/api-read-retry.cjs');
test('transient read failures get one retry with the same authentication and deadline', async () => {
  let calls = 0; const waits = [];
  const options = { headers: { 'x-bot-secret': 'fixture' }, signal: AbortSignal.timeout(5000) };
  const result = await fetchBotApi('https://fixture/api/tag', options, async (_url, init) => {
    assert.equal(init, options);
    return new Response('{}', { status: ++calls === 1 ? 503 : 200 });
  }, async ms => waits.push(ms));
  assert.equal(result.status, 200); assert.equal(calls, 2); assert.deepEqual(waits, [250]);
});
test('writes and non-transient failures are never replayed', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    let calls = 0;
    assert.equal((await fetchBotApi('fixture', { method }, async () => { calls++; return new Response('{}', { status: 503 }); })).status, 503);
    assert.equal(calls, 1);
    await assert.rejects(fetchBotApi('fixture', { method }, async () => { calls++; throw new TypeError('fetch failed'); }));
    assert.equal(calls, 2);
  }
  for (const status of [400, 401, 403, 409, 429, 500]) {
    let calls = 0;
    await fetchBotApi('fixture', {}, async () => { calls++; return new Response('{}', { status }); });
    assert.equal(calls, 1);
  }
});
test('retry is bounded and never sends after the original deadline expires', async () => {
  let calls = 0;
  await assert.rejects(fetchBotApi('fixture', {}, async () => { calls++; throw new TypeError('fetch failed'); }, async () => {}));
  assert.equal(calls, 2);
  const controller = new AbortController(); calls = 0;
  await assert.rejects(fetchBotApi('fixture', { signal: controller.signal }, async () => { calls++; return new Response('{}', { status: 502 }); }, async () => controller.abort()));
  assert.equal(calls, 1);
});
