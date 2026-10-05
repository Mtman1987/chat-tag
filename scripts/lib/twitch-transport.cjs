'use strict';

const normalize = value => String(value || '').trim().toLowerCase().replace(/^#/, '');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const channelManagers = new WeakMap();

function splitChatMessage(message) {
  const chunks = [];
  let chunk = '';
  for (const character of String(message)) {
    if (Buffer.byteLength(chunk + character, 'utf8') > 450) {
      chunks.push(chunk);
      chunk = '';
    }
    chunk += character;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function twitchChannels(client) {
  if (channelManagers.has(client)) return channelManagers.get(client);
  const confirmed = new Set();
  let tail = Promise.resolve();
  const mark = channel => { const key = normalize(channel); if (key) confirmed.add(key); };
  // tmi.js can prepopulate userstate when say() precedes join(). In that case
  // its USERSTATE handler never adds the channel to getChannels(). ROOMSTATE
  // and real incoming channel messages still prove membership on this socket.
  client.on('roomstate', mark);
  client.on('join', (channel, _username, self) => { if (self) mark(channel); });
  client.on('message', (channel, tags, _message, self) => {
    if (!self && tags?.['message-type'] !== 'whisper' && String(channel).startsWith('#')) mark(channel);
  });
  client.on('part', (channel, _username, self) => { if (self) confirmed.delete(normalize(channel)); });
  client.on('disconnected', () => confirmed.clear());
  const manager = {
    channels: () => [...new Set([...client.getChannels().map(normalize), ...confirmed])].map(channel => `#${channel}`),
    join(channel) {
      const key = normalize(channel);
      const run = tail.then(async () => {
        if (manager.channels().includes(`#${key}`)) return;
        try { await client.join(`#${key}`); }
        catch (error) {
          if (!String(error?.message || error).toLowerCase().includes('no response') || !manager.channels().includes(`#${key}`)) throw error;
        }
      });
      tail = run.catch(() => {});
      return run;
    },
  };
  channelManagers.set(client, manager);
  return manager;
}

function createTwitchSendQueue({ now = Date.now, wait = sleep } = {}) {
  let tail = Promise.resolve();
  let blockedUntil = 0;
  const recent = [];
  const lastByChannel = new Map();
  const slowByChannel = new Map();
  const held = new Map();
  const trim = () => {
    while (recent.length && recent[0] <= now() - 30_000) recent.shift();
    for (const [key, until] of held) if (until <= now()) held.delete(key);
  };
  const keyFor = (channel, message) => `${normalize(channel)}:${message}`;
  const queue = {
    notice(channel, code) {
      const key = normalize(channel);
      if (/^(?:msg_)?ratelimit$/.test(code)) blockedUntil = Math.max(blockedUntil, now() + 30_000);
      if (/automod|msg_rejected/.test(code)) {
        const last = lastByChannel.get(key);
        if (last && now() - last.at < 10_000) held.set(keyFor(key, last.message), now() + 10 * 60_000);
      }
    },
    roomstate(channel, state) {
      if (Object.prototype.hasOwnProperty.call(state || {}, 'slow')) slowByChannel.set(normalize(channel), Math.max(0, Number(state.slow) || 0) * 1000);
    },
    send(channel, message, deliver) {
      const key = normalize(channel);
      const run = tail.then(async () => {
        while (true) {
          trim();
          if (held.has(keyFor(key, message))) return { success: false, reason: 'automod-held', allowFallback: false };
          const last = lastByChannel.get(key);
          const until = Math.max(blockedUntil,
            recent.length >= 18 ? recent[0] + 30_050 : 0,
            last ? last.at + Math.max(1100, slowByChannel.get(key) || 0) : 0);
          if (until <= now()) break;
          await wait(until - now());
        }
        const at = now();
        recent.push(at);
        lastByChannel.delete(key);
        lastByChannel.set(key, { at, message });
        while (lastByChannel.size > 500) lastByChannel.delete(lastByChannel.keys().next().value);
        const result = await deliver();
        if (result?.reason === 'automod-held') held.set(keyFor(key, message), now() + 10 * 60_000);
        if (result?.reason === 'rate-limit') queue.notice(key, 'msg_ratelimit');
        return result;
      });
      tail = run.catch(() => {});
      return run;
    },
  };
  return queue;
}

module.exports = { twitchChannels, createTwitchSendQueue, splitChatMessage };
