const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('public/overlay-chunk-recovery.js', 'utf8');
function boot(path = '/overlay/game-hub/system-spacemountainlive-activity', last = 0, denied = false) {
  let reloads = 0, logs = 0;
  const timers = [], events = {}, storage = new Map();
  storage.set('nebula:chunk-recovery:' + path, String(last));
  const context = { location: { pathname: path, reload() { reloads++; } }, Date: { now: () => 100000 },
    sessionStorage: { getItem(k) { if (denied) throw Error('disabled'); return storage.get(k); }, setItem(k, v) { storage.set(k, v); } },
    setTimeout(fn, ms) { timers.push({ fn, ms }); }, addEventListener(name, fn) { events[name] = fn; },
    console: { error() { logs++; } } };
  vm.runInNewContext(code, context);
  return { context, timers, events, storage, reloads: () => reloads, logs: () => logs };
}
test('a React-caught chunk failure reloads only the game iframe and retains the original log', () => {
  const b = boot();
  b.context.console.error({ name: 'ChunkLoadError', message: 'Loading chunk 2416 failed.' });
  b.events.error({ error: { name: 'ChunkLoadError' } });
  assert.equal(b.timers.length, 1);
  assert.equal(b.timers[0].ms, 1000);
  assert.equal(b.logs(), 1);
  b.timers[0].fn();
  assert.equal(b.reloads(), 1);
});
test('successive failed loads back off instead of looping; unavailable storage prevents a loop', () => {
  const b = boot(undefined, 99000);
  b.events.unhandledrejection({ reason: Error('Loading chunk 2416 failed.') });
  assert.equal(b.timers[0].ms, 59000);
  const denied = boot(undefined, 0, true);
  denied.context.console.error(Error('Loading chunk 2416 failed.'));
  assert.equal(denied.timers.length, 0);
});
test('ordinary errors and non-game pages do not cause reloads', () => {
  const b = boot(); b.context.console.error(Error('Treasure state unavailable'));
  assert.equal(b.timers.length, 0);
  const other = boot('/dashboard'); other.context.console.error(Error('Loading chunk 2416 failed.'));
  assert.equal(other.timers.length, 0);
});
