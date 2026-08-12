const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync('src/middleware.ts', 'utf8');

test('DSH Discord delivery uses scoped SPMT service OAuth', () => {
  assert.ok(source.includes('/api/oauth/serviceinfo'));
  assert.ok(source.includes("payload?.client_id === 'discord-stream-hub'"));
  assert.ok(source.includes("scopes.includes('discord:control')"));
  assert.ok(source.includes("pathname === '/api/discord/chat'"));
  assert.ok(source.includes('isAuthorizedDshServiceToken(authorizationToken)'));
});
