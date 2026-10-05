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

test('a failed tenant does not block result delivery to another tenant', async () => {
  const sent = [], acknowledgements = [];
  const tick = createWordChainLifecycleRunner({
    apiCall: async (url, options) => {
      const body = JSON.parse(options.body);
      acknowledgements.push(...body.acknowledgedResults);
      return { wordChainResults: body.ackOnly ? [] : [
        { id: 'a1', channel: 'alpha', message: 'scores' }, { id: 'a2', channel: 'alpha', message: 'winner' },
        { id: 'b1', channel: 'beta', message: 'scores' },
      ] };
    },
    send: async channel => { if (channel === 'alpha') throw new Error('disconnected'); sent.push(channel); }, warn: () => {},
  });
  await tick();
  assert.deepEqual(sent, ['beta']);
  assert.deepEqual(acknowledgements, ['b1']);
});

test('overflow results send once per tenant per poll while other tenants receive their results', async () => {
  let queue = [
    { id: 'a1', channel: 'alpha', message: 'round' },
    { id: 'a2', channel: 'alpha', message: 'overflow' },
    { id: 'a3', channel: 'alpha', message: 'more players' },
    { id: 'b1', channel: 'beta', message: 'round' },
  ];
  const sent = [];
  const tick = createWordChainLifecycleRunner({
    apiCall: async (url, options) => {
      const body = JSON.parse(options.body);
      queue = queue.filter(event => !body.acknowledgedResults.includes(event.id));
      return { wordChainResults: body.ackOnly ? [] : queue };
    },
    send: async (channel, message) => { sent.push(`${channel}:${message}`); },
  });
  await tick();
  assert.deepEqual(sent, ['alpha:round', 'beta:round']);
  assert.deepEqual(queue.map(event => event.id), ['a2', 'a3']);
  await tick();
  assert.deepEqual(sent, ['alpha:round', 'beta:round', 'alpha:overflow']);
  await tick();
  await tick();
  assert.deepEqual(sent, ['alpha:round', 'beta:round', 'alpha:overflow', 'alpha:more players']);
  assert.equal(queue.length, 0);
});
