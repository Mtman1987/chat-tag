const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createLoungeCheckinShoutout, formatCheckinShoutoutReply } = require('../src/lib/chat-tag-checkin-shoutout');

function fixture(options = {}) {
  let clock = 1_000_000;
  const calls = [], lookups = [];
  const identity = {
    login: 'spacemountainlive', user_id: '100', client_id: 'test-client',
    scopes: ['moderator:manage:shoutouts'], ...options.identity,
  };
  const service = createLoungeCheckinShoutout({
    now: () => clock,
    getToken: async () => 'test-credential', getClientId: () => 'test-client',
    lookupUser: async channel => { lookups.push(channel); return { id: channel === 'first_channel' ? '200' : '300' }; },
    fetchImpl: async (url, request) => {
      calls.push({ url: new URL(url), request });
      if (url.includes('/validate')) return { ok: true, json: async () => identity };
      return { status: options.status ?? 204 };
    },
  });
  return { service, calls, lookups, advance: ms => { clock += ms; }, posts: () => calls.filter(c => c.request.method === 'POST') };
}

test('native check-in shoutout originates in the Lounge and targets the command channel', async () => {
  const f = fixture();
  const result = await f.service.send('#FIRST_CHANNEL');
  assert.equal(result.status, 'sent');
  assert.equal(result.channel, 'first_channel');
  assert.deepEqual(f.lookups, ['first_channel']);
  const [sent] = f.posts();
  assert.equal(sent.url.origin + sent.url.pathname, 'https://api.twitch.tv/helix/chat/shoutouts');
  assert.deepEqual(Object.fromEntries(sent.url.searchParams), {
    from_broadcaster_id: '100', to_broadcaster_id: '200', moderator_id: '100',
  });
  assert.equal(sent.request.headers.Authorization, 'Bearer test-credential');
  assert.match(formatCheckinShoutoutReply(result), /Native Twitch \/shoutout sent.*first_channel.*Lounge/);
});

test('startup capability check is read-only and never exposes credentials', async () => {
  const f = fixture();
  assert.equal((await f.service.refreshCapability()).ready, true);
  assert.equal(f.posts().length, 0);
  assert.equal(f.lookups.length, 0);
  assert.doesNotMatch(JSON.stringify(f.service.getStatus()), /test-credential|test-client|scopes/);
});

test('concurrent commands respect the Lounge two-minute cooldown and the one-hour target cooldown', async () => {
  const f = fixture();
  const results = await Promise.all([f.service.send('first_channel'), f.service.send('second_channel')]);
  assert.deepEqual(results.map(r => r.status), ['sent', 'cooldown']);
  assert.equal(f.posts().length, 1);
  f.advance(120_000);
  assert.equal((await f.service.send('second_channel')).status, 'sent');
  const sameTarget = await f.service.send('first_channel');
  assert.equal(sameTarget.status, 'cooldown');
  assert.equal(sameTarget.retryAfterSeconds, 3480);
  f.advance(3480_000);
  assert.equal((await f.service.send('first_channel')).status, 'sent');
});

for (const [identity, expected] of [
  [{ scopes: ['chat:edit'] }, 'missing-shoutout-permission'],
  [{ login: 'some_other_bot' }, 'wrong-broadcaster-account'],
  [{ client_id: 'other-client' }, 'wrong-broadcaster-account'],
]) {
  test(`does not attempt native sends with ${expected}`, async () => {
    const f = fixture({ identity });
    assert.equal((await f.service.send('first_channel')).status, expected);
    assert.equal(f.posts().length, 0);
    assert.equal(f.service.getStatus().ready, false);
  });
}

for (const [status, expected] of [[200, 'unavailable'], [400, 'not-eligible'], [401, 'authorization-required'], [403, 'authorization-required'], [429, 'cooldown'], [500, 'unavailable']]) {
  test(`Twitch ${status} is reported honestly without claiming a shoutout was sent`, async () => {
    const f = fixture({ status });
    const result = await f.service.send('first_channel');
    assert.equal(result.status, expected);
    assert.doesNotMatch(formatCheckinShoutoutReply(result), /shoutout sent/);
  });
}

test('self-shoutouts and invalid channel names do not call Twitch', async () => {
  const f = fixture();
  assert.equal((await f.service.send('spacemountainlive')).status, 'self-shoutout');
  assert.equal((await f.service.send('bad/channel')).status, 'invalid-channel');
  assert.equal(f.calls.length, 0);
});

async function command({ message = 'spmt checkin', channel = '#player_channel', sourceChannel, blacklisted = false, muted = false } = {}) {
  const source = fs.readFileSync(process.env.BOT_FILE || 'bot.js', 'utf8');
  const start = source.indexOf('    let rawMessage = message.trim();');
  const end = source.indexOf('    // Chat Tag predates Games Hub', start);
  assert.ok(start > 0 && end > start);
  const targets = [], replies = [];
  const context = {
    message, channel,
    tags: { id: 'message-1', username: 'ordinary_viewer', 'display-name': 'OrdinaryViewer', 'user-id': '42', mod: false, badges: {}, 'room-id': '100', ...(sourceChannel ? { 'source-room-id': '200' } : {}) },
    senderLogin: 'ordinary_viewer', pendingGameChoices: new Map(), recentMessages: new Set(),
    setTimeout() {}, console: { log() {}, error() {} }, client: {},
    resolveChannelFromRoomId: async () => sourceChannel,
    sendChatWithSharedFallback: async (_client, _channel, text) => { replies.push(text); },
    isIgnoredSender: () => false,
    readCommandGates: async () => ({ blacklistData: { blacklisted: blacklisted ? ['player_channel'] : [] }, mutedData: { muted: muted ? ['player_channel'] : [] } }),
    checkinShoutout: { send: async target => { targets.push(target); return { status: 'sent', channel: target, destination: 'spacemountainlive' }; } },
    formatCheckinShoutoutReply,
  };
  await vm.runInNewContext(`(async () => {${source.slice(start, end)}})()`, context);
  await new Promise(resolve => setImmediate(resolve));
  return { targets, replies };
}

test('ordinary viewers trigger the observed channel, not their own account', async () => {
  const result = await command();
  assert.deepEqual(result.targets, ['player_channel']);
  assert.equal(result.replies.length, 1);
});

test('shared-chat check-ins target their original channel rather than the mirrored Lounge room', async () => {
  assert.deepEqual((await command({ channel: '#spacemountainlive', sourceChannel: 'player_channel' })).targets, ['player_channel']);
});

test('other commands and blacklisted channels cannot trigger this shoutout', async () => {
  assert.deepEqual((await command({ message: 'spmt score' })).targets, []);
  assert.deepEqual((await command({ blacklisted: true })).targets, []);
});

test('muted source channels still process check-in but do not get a chat notice', async () => {
  const result = await command({ muted: true });
  assert.deepEqual(result.targets, ['player_channel']);
  assert.deepEqual(result.replies, []);
});
