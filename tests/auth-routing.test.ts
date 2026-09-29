import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { NextRequest } from 'next/server';
import { middleware } from '../src/middleware';
import { isBotRequest, isStreamWeaverGameHubRequest, requireAdminRequest } from '../src/lib/auth';

const originalEnvironment = {
  BOT_SECRET_KEY: process.env.BOT_SECRET_KEY,
  STREAMWEAVER_SECRET: process.env.STREAMWEAVER_SECRET,
  QUACKVERSE_TUNNEL_ONLY: process.env.QUACKVERSE_TUNNEL_ONLY,
};

before(() => {
  process.env.BOT_SECRET_KEY = 'auth-routing-test-secret';
  process.env.STREAMWEAVER_SECRET = 'streamweaver-game-hub-test-secret';
  delete process.env.QUACKVERSE_TUNNEL_ONLY;
});

after(() => {
  if (originalEnvironment.BOT_SECRET_KEY === undefined) delete process.env.BOT_SECRET_KEY;
  else process.env.BOT_SECRET_KEY = originalEnvironment.BOT_SECRET_KEY;

  if (originalEnvironment.STREAMWEAVER_SECRET === undefined) delete process.env.STREAMWEAVER_SECRET;
  else process.env.STREAMWEAVER_SECRET = originalEnvironment.STREAMWEAVER_SECRET;

  if (originalEnvironment.QUACKVERSE_TUNNEL_ONLY === undefined) delete process.env.QUACKVERSE_TUNNEL_ONLY;
  else process.env.QUACKVERSE_TUNNEL_ONLY = originalEnvironment.QUACKVERSE_TUNNEL_ONLY;
});

function request(pathname: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) {
  return new NextRequest(`https://chat-tag.test${pathname}`, init);
}

test('public dashboard can read the Chat Tag roster', async () => {
  const response = await middleware(request('/api/tag'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-middleware-next'), '1');
});

test('DSH clip worker can read the public Nebula showcase manifest', async () => {
  const response = await middleware(request('/api/game-hub/showcase-manifest'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-middleware-next'), '1');
});

test('OBS can read the public Nebula instruction state', async () => {
  const response = await middleware(request('/api/game-hub/instructions?channel=spacemountainlive'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-middleware-next'), '1');
});

test('activity overlays can read the public Chat Wars battlefield', async () => {
  const response = await middleware(request('/api/game-hub/chat-wars?channel=spacemountainlive'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-middleware-next'), '1');
});

test('main word-game overlays can read the public stage snapshot', async () => {
  const response = await middleware(request('/api/game-hub/word-stage?channel=spacemountainlive&game=wordchain'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-middleware-next'), '1');
});

test('anonymous Chat Tag writes stay protected', async () => {
  const response = await middleware(request('/api/tag', { method: 'POST' }));
  assert.equal(response.status, 401);
});

test('valid bot secret can reach Chat Tag mutations', async () => {
  const response = await middleware(request('/api/tag', {
    method: 'POST',
    headers: { 'x-bot-secret': 'auth-routing-test-secret' },
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-middleware-next'), '1');
});

test('machine-prefixed writes are no longer trusted by path alone', async () => {
  const response = await middleware(request('/api/discord/announce', { method: 'POST' }));
  assert.equal(response.status, 401);
});

test('valid bot secret can reach machine routes', async () => {
  const response = await middleware(request('/api/discord/announce', {
    method: 'POST',
    headers: { 'x-bot-secret': 'auth-routing-test-secret' },
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-middleware-next'), '1');
});

test('bot authentication validates the shared secret instead of the URL prefix', () => {
  assert.equal(isBotRequest(request('/api/tag', {
    method: 'POST',
    headers: { 'x-bot-secret': 'auth-routing-test-secret' },
  })), true);

  assert.equal(isBotRequest(request('/api/bot/state', {
    headers: { 'x-bot-secret': 'wrong-secret' },
  })), false);
});

test('valid bot requests retain administrative service authorization', () => {
  const result = requireAdminRequest(request('/api/tag', {
    method: 'POST',
    headers: { 'x-bot-secret': 'auth-routing-test-secret' },
  }));

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.user.id, 'bot-service');
    assert.equal(result.user.twitchUsername, 'bot-service');
  }
});

test('StreamWeaver service secret reaches Nebula commands and overlay writes only', async () => {
  for (const path of ['/api/game-hub/command', '/api/game-hub/bot-overlays']) {
    const req = request(path, {
      method: 'POST',
      headers: { 'x-bot-secret': 'streamweaver-game-hub-test-secret' },
    });
    assert.equal((await middleware(req)).status, 200);
    assert.equal(isStreamWeaverGameHubRequest(req), true);
    assert.equal(isBotRequest(req), false);
  }
  const unrelated = request('/api/tag', {
    method: 'POST',
    headers: { 'x-bot-secret': 'streamweaver-game-hub-test-secret' },
  });
  assert.equal((await middleware(unrelated)).status, 401);
  assert.equal(isBotRequest(unrelated), false);
  for (const path of ['/api/game-hub/command', '/api/game-hub/bot-overlays']) {
    const req = request(path, { method: 'POST', headers: { 'x-bot-secret': 'wrong-secret' } });
    assert.equal((await middleware(req)).status, 401);
    assert.equal(isStreamWeaverGameHubRequest(req), false);
  }
});
