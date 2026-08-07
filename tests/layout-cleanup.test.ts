import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('header exposes one compact app navigation row without duplicate Quackverse pages', () => {
  const header = read('src/components/header.tsx');

  assert.match(header, /overflow-x-auto/);
  assert.match(header, /href: '\/settings', label: 'Settings'/);
  assert.doesNotMatch(header, /Quackverse-Command/);
  assert.doesNotMatch(header, /Quackverse-Preview/);
  assert.doesNotMatch(header, /Quackverse-Guide/);
});

test('home opens on Chat Tag and does not repeat ChatTagGame in the admin tab', () => {
  const dashboard = read('src/app/main-dashboard.tsx');

  assert.match(dashboard, /defaultValue="chat-tag"/);
  assert.match(dashboard, /ChatTagGame players=\{memoizedPlayers\} adminMode=\{isAdmin\}/);
  assert.equal((dashboard.match(/<ChatTagGame/g) || []).length, 1);
  assert.match(dashboard, /href="\/settings"/);
  assert.doesNotMatch(dashboard, /Live Preview/);
  assert.doesNotMatch(dashboard, /cosmic-grid/);
});

test('settings start with controls and enlarged cards stay inside the viewport', () => {
  const shell = read('src/components/root-shell.tsx');
  const styles = read('src/app/globals.css');

  assert.match(shell, /data-route=\{pathname\}/);
  assert.match(styles, /\[data-route='\/settings'\] \.cosmic-hero/);
  assert.match(styles, /max-height: calc\(100dvh - 1\.5rem\)/);
  assert.match(styles, /transform: translate\(-50%, -50%\)/);
  assert.match(styles, /overflow-y: auto/);
});
