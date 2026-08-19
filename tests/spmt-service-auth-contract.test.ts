import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('src/middleware.ts', 'utf8');

test('ChatTag validates StreamWeaver service bearer through SPMT serviceinfo', () => {
  assert.match(source, /\/api\/oauth\/serviceinfo/);
  assert.match(source, /service\?\.token_use === 'client_credentials'/);
  assert.match(source, /service\?\.client_id \|\| ''\) === 'streamweaver'/);
});

test('ChatTag grants only the blacklist read scope and route', () => {
  assert.match(source, /STREAMWEAVER_BLACKLIST_SCOPE = 'chat-tag:blacklist:read'/);
  assert.match(source, /request\.method !== 'GET'/);
  assert.match(source, /request\.nextUrl\.pathname !== '\/api\/bot\/blacklist'/);
  assert.match(source, /scopes\.includes\(STREAMWEAVER_BLACKLIST_SCOPE\)/);
});
