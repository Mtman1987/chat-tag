import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('Lounge compact mode prioritizes names over broadcast emotes', () => {
  const source = fs.readFileSync('src/app/overlay/[userId]/page.tsx', 'utf8');
  assert.match(source, /searchParams\.get\('compact'\) === 'lounge'/);
  assert.match(source, /loungeCompact \? 'absolute' : 'static'/);
  assert.match(source, /loungeCompact \? 'min\(9vw,14vh\)'/);
  assert.match(source, /height: loungeCompact \? '100%' : undefined/);
});
