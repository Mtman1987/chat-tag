const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(process.env.BOT_FILE || 'bot.js', 'utf8');
const start = source.indexOf('async function sendMessageViaAPI(');
const end = source.indexOf('async function getLiveMembersCached(', start);
async function send(payload, status = 200) {
  let calls = 0;
  const context = vm.createContext({
    console: { log() {}, error() {}, warn() {} }, AbortSignal,
    chatSendQueue: { send: (_channel, _message, deliver) => deliver() }, appToken: 'test-token', username: 'test-bot',
    env: {}, withCrowns: async value => value, getTwitchClientId: () => 'test-client',
    fetch: async () => ++calls < 3
      ? { json: async () => ({ data: [{ id: 'test-user' }] }) }
      : { ok: status === 200, status, json: async () => payload, text: async () => 'server-error' },
  });
  vm.runInContext(source.slice(start, end), context);
  return context.sendMessageViaAPI('test-channel', 'test-message', true);
}
test('a confirmed Twitch delivery succeeds', async () => {
  assert.equal((await send({ data: [{ is_sent: true }] })).success, true);
});
test('AutoMod holds must not be retried through IRC', async () => {
  const result = await send({ data: [{ is_sent: false, drop_reason: { code: 'automod_held' } }] });
  assert.equal(result.success, false);
  assert.equal(result.reason, 'automod-held');
  assert.equal(result.allowFallback, false);
});
test('empty or malformed success responses permit IRC fallback', async () => {
  for (const payload of [null, {}, { data: [] }]) assert.equal((await send(payload)).success, false);
});
test('HTTP errors retain the existing IRC fallback', async () => {
  assert.equal((await send({}, 500)).success, false);
});


test('Twitch rate limits and moderation drops never switch transports', async () => {
  for (const code of ['rate_limit_exceeded', 'banned', 'duplicate', 'msg_rejected']) {
    assert.equal((await send({ data: [{ is_sent: false, drop_reason: { code } }] })).allowFallback, false);
  }
  assert.equal((await send({}, 429)).allowFallback, false);
});
