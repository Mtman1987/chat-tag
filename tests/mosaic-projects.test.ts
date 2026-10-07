import test from 'node:test';
import assert from 'node:assert/strict';
import { publishMosaic, sharedMosaicProjects, startMosaicProject, findMosaicArtwork, mosaicTemplate, mosaicTemplateSvg, validateMosaicTemplate, resumeMosaicProject } from '../src/lib/mosaic-projects';
import { getMosaicChannelState, claimNextMosaicRequest, queueMosaicTheme, installMosaicTemplate, finishMosaicForPreview, mosaicPublicSnapshot } from '../src/lib/nebula-mosaic';
import { setChannelGameRunning } from '../src/lib/game-hub-state';
const template = () => ({ format: 'nebula-mosaic', version: 1, width: 40, height: 50, theme: 'Flowers', paletteId: 'classic', target: Array(2000).fill('Y') });
const fixture = () => ({ gameSettings: { default: {} } } as any);
test('only explicitly published templates are shared; recipient progress and rewards are isolated', () => {
  const state = fixture();
  const source = startMosaicProject(state, 'tenant1', template());
  source.painted[0] = 'Y'; source.paintedBy[0] = 'private-player'; source.awardedMilestones = ['board1'];
  assert.equal(sharedMosaicProjects(state).length, 0);
  const shared = publishMosaic(state, 'tenant1', source.id, true)!;
  const copy = startMosaicProject(state, 'tenant2', shared.template);
  assert.notEqual(copy.id, source.id);
  assert.equal(copy.painted.every(color => color === ''), true);
  assert.deepEqual(copy.awardedMilestones, []);
  copy.target[0] = 'R'; copy.painted[1] = 'R';
  assert.equal(source.target[0], 'Y'); assert.equal(source.painted[1], '');
  assert.doesNotMatch(JSON.stringify(shared), /private-player|board1/);
  publishMosaic(state, 'tenant1', source.id, false);
  assert.equal(sharedMosaicProjects(state).length, 0);
});
test('switch requires explicit save-and-switch and preserves current progress', () => {
  const state = fixture(), art = startMosaicProject(state, 'tenant', template());
  art.painted[0] = 'Y';
  assert.throws(() => startMosaicProject(state, 'tenant', template()), /still active/);
  startMosaicProject(state, 'tenant', template(), true);
  assert.equal(findMosaicArtwork(state, 'tenant', art.id)?.painted[0], 'Y');
  assert.equal(findMosaicArtwork(state, 'tenant', art.id)?.status, 'suspended');
});
test('downloaded templates round-trip without private identity or an XP ledger; malformed files fail', () => {
  const state = fixture(), art = startMosaicProject(state, 'tenant', template());
  const portable = mosaicTemplate(art);
  assert.deepEqual(validateMosaicTemplate(JSON.parse(JSON.stringify(portable))).target, art.target);
  assert.equal((mosaicTemplateSvg(portable).match(/<rect /g) || []).length, 2000);
  for (const invalid of [{ ...portable, target: ['Y'] }, { ...portable, paletteId: '__proto__' }, { ...portable, target: Array(2000).fill('<script>') }, { ...portable, version: 2 }]) assert.throws(() => validateMosaicTemplate(invalid));
});
test('completed painting image remains accessible by id after the next painting starts', () => {
  const state = fixture(), first = startMosaicProject(state, 'tenant', template());
  finishMosaicForPreview(state, 'tenant');
  const finalUrl = mosaicPublicSnapshot(state, 'tenant').artwork!.finalImageUrl;
  assert.ok(finalUrl.includes(encodeURIComponent(first.id)));
  startMosaicProject(state, 'tenant', { ...template(), theme: 'Alien' });
  assert.equal(findMosaicArtwork(state, 'tenant', first.id)?.status, 'completed');
  assert.equal(findMosaicArtwork(state, 'tenant', first.id)?.theme, 'Flowers');
});
test('only one generation claim can run, and a late generator cannot overwrite a selected painting', () => {
  const state = fixture(); setChannelGameRunning(state, 'tenant', 'pixelbattle', true);
  queueMosaicTheme(state, { channel: 'tenant', username: 'tenant', userId: '7', theme: 'Alien' });
  queueMosaicTheme(state, { channel: 'tenant', username: 'tenant', userId: '7', theme: 'Flowers' });
  const request = claimNextMosaicRequest(state, 'tenant')!;
  assert.equal(claimNextMosaicRequest(state, 'tenant'), null);
  const chosen = startMosaicProject(state, 'tenant', template());
  assert.throws(() => installMosaicTemplate(state, 'tenant', request.id, Array(2000).fill('R')), /already active/);
  assert.equal(getMosaicChannelState(state, 'tenant').current?.id, chosen.id);
});

test('resuming a session stopped by the old timer preserves cells and awarded milestones', () => {
  const state = fixture(), art = startMosaicProject(state, 'tenant', template());
  art.painted[0] = 'Y'; art.awardedMilestones = ['board1'];
  setChannelGameRunning(state, 'tenant', 'pixelbattle', false);
  resumeMosaicProject(state, 'tenant', art.id);
  const resumed = findMosaicArtwork(state, 'tenant', art.id)!;
  assert.equal(resumed.status, 'active'); assert.equal(resumed.painted[0], 'Y');
  assert.deepEqual(resumed.awardedMilestones, ['board1']);
});
test('shared designs can be unpublished after their original save has left the local save list', () => {
  const state = fixture(), art = startMosaicProject(state, 'tenant', template());
  publishMosaic(state, 'tenant', art.id, true);
  getMosaicChannelState(state, 'tenant').current = undefined;
  getMosaicChannelState(state, 'tenant').saves = [];
  publishMosaic(state, 'tenant', art.id, false);
  assert.equal(sharedMosaicProjects(state).length, 0);
});
