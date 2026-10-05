const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { twitchChannels, createTwitchSendQueue, splitChatMessage } = require('../scripts/lib/twitch-transport.cjs');

test('long Unicode replies split before tmi can bypass the message queue', () => {
  const message = 'Hello 🌌 '.repeat(100);
  const chunks = splitChatMessage(message);
  assert.equal(chunks.join(''), message);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => Buffer.byteLength(chunk) <= 450));
});

function client(join) {
  const bot = new EventEmitter();
  bot.getChannels = () => [];
  bot.join = channel => join(bot, channel);
  return bot;
}
test('ROOMSTATE recovers tmi membership after say-before-join and prevents repeat JOINs', async () => {
  let joins = 0;
  const bot = client(async (emitter, channel) => {
    joins++;
    emitter.emit('roomstate', channel, {});
    throw 'No response from Twitch.';
  });
  const manager = twitchChannels(bot);
  await Promise.all([manager.join('#Example'), manager.join('example')]);
  assert.equal(joins, 1);
  assert.deepEqual(manager.channels(), ['#example']);
  bot.emit('part', '#example', 'bot', true);
  assert.deepEqual(manager.channels(), []);
  await manager.join('example');
  bot.emit('disconnected');
  assert.deepEqual(manager.channels(), []);
});
test('real channel messages confirm only the receiving channel; whispers and local echoes do not', () => {
  const bot = client(async () => {}), manager = twitchChannels(bot);
  bot.emit('message', '#echo', {}, 'local', true);
  bot.emit('message', '#person', { 'message-type': 'whisper' }, 'private', false);
  bot.emit('message', '#destination', { 'source-room-id': 'another-channel' }, 'real', false);
  assert.deepEqual(manager.channels(), ['#destination']);
});
test('genuine join failures still fail, and simultaneous different joins are serialized', async () => {
  let active = 0, maximum = 0;
  const bot = client(async () => {
    maximum = Math.max(maximum, ++active);
    await Promise.resolve(); active--;
    throw 'No response from Twitch.';
  });
  const manager = twitchChannels(bot);
  const results = await Promise.allSettled([manager.join('one'), manager.join('two')]);
  assert.equal(maximum, 1);
  assert.ok(results.every(result => result.status === 'rejected'));
});
function fakeQueue() {
  let time = 1_000_000;
  return { now: () => time, queue: createTwitchSendQueue({ now: () => time, wait: async ms => { time += ms; } }) };
}
test('concurrent senders share the rolling account limit and channel spacing', async () => {
  const { queue, now } = fakeQueue(), sent = [];
  await Promise.all(Array.from({ length: 40 }, (_, i) => queue.send(`channel${i % 2}`, String(i), async () => { sent.push({ at: now(), channel: i % 2 }); })));
  for (const entry of sent) assert.ok(sent.filter(other => other.at > entry.at - 30_000 && other.at <= entry.at).length <= 18);
  for (let i = 2; i < sent.length; i++) assert.ok(sent[i].at - sent[i - 2].at >= 1100);
});
test('rate notices back off, slow mode persists across partial room updates, and failures release queue', async () => {
  const { queue, now } = fakeQueue(), initial = now();
  queue.notice('channel', 'msg_ratelimit');
  await assert.rejects(queue.send('channel', 'one', async () => { throw Error('socket closed'); }));
  assert.ok(now() - initial >= 30_000);
  const first = now();
  queue.roomstate('channel', { slow: '10' });
  queue.roomstate('channel', { 'followers-only': '0' });
  await queue.send('channel', 'two', async () => true);
  assert.ok(now() - first >= 10_000);
});
test('held messages are never resent, but other messages continue', async () => {
  const { queue } = fakeQueue(); let sends = 0;
  const deliver = async () => { sends++; return { success: true }; };
  await queue.send('channel', 'held text', deliver);
  queue.notice('channel', 'msg_automod_held');
  assert.equal((await queue.send('channel', 'held text', deliver)).allowFallback, false);
  await queue.send('channel', 'other text', deliver);
  assert.equal(sends, 2);
});
