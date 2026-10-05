const assert = require('node:assert/strict');
const test = require('node:test');
const { createWordChainLifecycleRunner } = require('../scripts/lib/word-chain-lifecycle.cjs');

test('tenant results retry failed delivery and acknowledge only messages sent successfully', async () => {
  let queue = [{ id: '1', channel: 'tenant', message: 'Round scores' }, { id: '2', channel: 'tenant', message: 'Top 3' }];
  let failSend = true, failAck = true;
  const sent = [];
  const tick = createWordChainLifecycleRunner({
    apiCall: async (url, options) => {
      const body = JSON.parse(options.body);
      if (body.ackOnly && failAck) { failAck = false; throw new Error('API unavailable'); }
      queue = queue.filter(event => !body.acknowledgedResults.includes(event.id));
      return { wordChainResults: body.ackOnly ? [] : queue };
    },
    send: async (channel, message) => {
      assert.equal(channel, 'tenant');
      if (message === 'Top 3' && failSend) { failSend = false; throw new Error('IRC unavailable'); }
      sent.push(message);
    }, warn: () => {},
  });
  await assert.rejects(tick(), /API unavailable/);
  assert.deepEqual(sent, ['Round scores']);
  await tick();
  await tick();
  assert.deepEqual(sent, ['Round scores', 'Top 3']);
  assert.equal(queue.length, 0);
});

test('overlapping polls cannot send a result twice', async () => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let requests = 0, sends = 0;
  const tick = createWordChainLifecycleRunner({
    apiCall: async (url, options) => { requests++; await held; return { wordChainResults: JSON.parse(options.body).ackOnly ? [] : [{ id: '1', channel: 'tenant', message: 'winner' }] }; },
    send: async () => { sends++; },
  });
  const first = tick();
  await tick();
  release();
  await first;
  assert.equal(requests, 2);
  assert.equal(sends, 1);
});
