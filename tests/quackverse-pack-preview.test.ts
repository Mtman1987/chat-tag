import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/quackverse/pack-preview/route';

test('Quackverse pack preview renders a valid PNG response', async () => {
  const response = await GET(new NextRequest('http://localhost/api/quackverse/pack-preview?ids=1'));
  const bytes = await response.arrayBuffer();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /^image\/png/);
  assert.ok(bytes.byteLength > 1_000);
});
