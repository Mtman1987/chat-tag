import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('Lounge compact mode gives names and large stats dedicated halves', () => {
  const source = fs.readFileSync('src/app/overlay/[userId]/page.tsx', 'utf8');
  assert.match(source, /searchParams\.get\('compact'\) === 'lounge'/);
  assert.match(source, /loungeCompact \? 'absolute' : 'static'/);
  assert.match(source, /<RotationText lines=\{broadcast.lines\}/);
  assert.match(source, /height: loungeCompact \? 'calc\(100% - 6px\)' : undefined/);
  assert.match(source, /top: loungeCompact \? '3%'/);
  assert.match(source, /right: loungeCompact \? '4%'/);
  assert.match(source, /<FitText min=\{13\} max=\{180\}>/);
  assert.match(source, /compact \? 'min\(14vw, 22vh\)'/);
  assert.match(source, /compact \? 'min\(6vw, 9vh\)'/);
  assert.match(source, /loungeCompact \? '1 1 55%'/);
  assert.match(source, /loungeCompact \? '0 0 45%'/);
  assert.match(source, /align="left" compact=\{loungeCompact\}/);
  assert.match(source, /align="center" compact=\{loungeCompact\}/);
  assert.match(source, /align="right" compact=\{loungeCompact\}/);
  assert.match(source, /opacity: loungeCompact \? 1 : \(dimBar/);
  assert.match(source, /transform: loungeCompact \? 'translateY\(0\)'/);
  assert.match(source, /left: loungeCompact \? 6 : 0/);
  assert.match(source, /right: loungeCompact \? 6 : 0/);
  assert.match(source, /textOverflow: loungeCompact && broadcast.type !== 'history' \? 'ellipsis'/);
});

test('Lounge announcements keep the blue card but hide its idle contents', () => {
  const source = fs.readFileSync('src/app/overlay/[userId]/page.tsx', 'utf8');
  assert.match(source, /compactAnnouncementActive = loungeCompact && Boolean\(broadcast\)/);
  assert.match(source, /opacity: compactAnnouncementActive \? 0 : 1/);
  assert.match(source, /background: data\.isFFA/);
});
