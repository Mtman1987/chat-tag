import assert from 'node:assert/strict';
import test from 'node:test';
import { getOrCreateGameHubPlayer, awardGameHubPoints } from '../src/lib/game-hub-state';
import { installMosaicTemplate, queueMosaicTheme, unlockMosaicControls, revealMosaic, mosaicPublicSnapshot, setMosaicBrush, setMosaicView, resetMosaicForReplay, parseMosaicPaintCommand, paintMosaicCell } from '../src/lib/nebula-mosaic';
import { normalizeControllerCommand, isPlayerMosaicCommand } from '../src/lib/mosaic-controller-command';
const identity = { userId:'7', username:'artist', channel:'tenant', now:1 };
function fixture(balance = 6000) {
  const state: any = { gameSettings:{default:{}} };
  const player = getOrCreateGameHubPlayer(state, identity);
  awardGameHubPoints(state, player, balance, 'fixture');
  const request = queueMosaicTheme(state, {...identity, theme:'owl', now:1});
  const art = installMosaicTemplate(state, 'tenant', request.request.id, Array(2000).fill('Y'), {}, 2);
  return { state, art, player: () => getOrCreateGameHubPlayer(state, identity) };
}
test('5,000-point unlock is permanent, personal, and charged once', () => {
  const f=fixture();
  assert.equal(unlockMosaicControls(f.state, identity).cost, 5000);
  assert.equal(unlockMosaicControls(f.state, identity).cost, 0);
  assert.equal(f.player().gamePointsBalance, 1000);
  paintMosaicCell(f.state, {...identity, command:parseMosaicPaintCommand('spmt A1Y')!, now:5});
  resetMosaicForReplay(f.state, 'tenant', 10);
  assert.ok(f.player().mosaicControlsUnlockedAt);
  assert.equal(f.player().lifetimeSpent, 5000);
  assert.equal(getOrCreateGameHubPlayer(f.state, {userId:'8',username:'other'}).mosaicControlsUnlockedAt, undefined);
});
test('insufficient funds cannot buy controls, brushes, or reveal', () => {
  const f=fixture(99);
  assert.throws(() => unlockMosaicControls(f.state, identity), /Not enough/);
  assert.throws(() => setMosaicBrush(f.state, {...identity, brush:3}), /Not enough/);
  assert.throws(() => revealMosaic(f.state, {...identity, now:100}), /Not enough/);
  assert.equal(f.player().gamePointsBalance, 99);
  assert.equal(f.player().mosaicControlsUnlockedAt, undefined);
  assert.equal(f.art.revealUntil, undefined);
  assert.equal(f.art.brushByPlayer?.['twitch:7'], undefined);
});
test('brush purchase covers every size and direction for only the current artwork', () => {
  const f=fixture(200);
  assert.equal(setMosaicBrush(f.state, {...identity, brush:1}).cost, 0);
  assert.equal(setMosaicBrush(f.state, {...identity, brush:3}).cost, 100);
  assert.equal(setMosaicBrush(f.state, {...identity, brush:{size:5,direction:'down'}}).cost, 0);
  assert.equal(setMosaicBrush(f.state, {...identity, brush:'left'}).cost, 0);
  resetMosaicForReplay(f.state,'tenant',100);
  assert.equal(setMosaicBrush(f.state, {...identity, brush:2}).cost, 100);
  assert.equal(f.player().gamePointsBalance, 0);
});
test('paid reveal lasts exactly 15 seconds without painting, completion, or rewards', () => {
  const f=fixture(300);
  const before=structuredClone(f.art);
  const reveal=revealMosaic(f.state,{...identity,now:100});
  assert.equal(reveal.cost,100);
  assert.equal(Date.parse(reveal.until),15100);
  assert.deepEqual(revealMosaic(f.state,{...identity,now:200}),{cost:0,until:reveal.until});
  const shown=mosaicPublicSnapshot(f.state,'tenant',15099).artwork!;
  assert.equal(shown.revealing,true);assert.equal(shown.width,40);assert.equal(shown.progress,0);
  assert.equal(shown.painted.every(x=>x===''),true);
  assert.equal(mosaicPublicSnapshot(f.state,'tenant',15100).artwork!.revealing,false);
  const {revealUntil,...after}=f.art;assert.deepEqual(after,before);
  assert.equal(f.player().gamePointsBalance,200);assert.equal(f.player().lifetimeEarned,300);
  assert.equal(revealMosaic(f.state,{...identity,now:15100}).cost,100);
});
test('show all remains free progress-only, and finished or suspended art cannot charge reveal', () => {
  const f=fixture(100);
  setMosaicView(f.state,'tenant','all',100);
  const snapshot=mosaicPublicSnapshot(f.state,'tenant',101).artwork!;
  assert.equal(snapshot.viewMode,'all');assert.equal(snapshot.revealing,false);assert.equal(snapshot.progress,0);
  assert.equal(f.player().gamePointsBalance,100);
  for (const status of ['completed','suspended'] as const) {f.art.status=status;assert.throws(()=>revealMosaic(f.state,{...identity,now:200}),/active, unfinished/);}
  assert.equal(f.player().gamePointsBalance,100);
});
test('controller accepts optional spmt and grants visitors only Mosaic play commands', () => {
  assert.equal(normalizeControllerCommand('spmt points','pixelbattle'),'spmt points');
  assert.equal(normalizeControllerCommand('stop mosaic','pixelbattle'),'spmt stop mosaic');
  for (const input of ['D12Y','spmt D12Y','spmt mosaic D12Y']) assert.equal(normalizeControllerCommand(input,'pixelbattle'),'spmt mosaic D12Y');
  for(const command of ['reveal','spmt reveal','spmt mosaic reveal','brush 3 down','show all','D12Y']) assert.ok(isPlayerMosaicCommand(normalizeControllerCommand(command,'pixelbattle')));
  for(const command of ['stop','finish','replay','palette neon','clearqueue','remove 1','checkin','say hi','start','D12Y stop']) assert.equal(isPlayerMosaicCommand(normalizeControllerCommand(command,'pixelbattle')),false);
});

test('testing week is free at zero balance and expires without granting paid entitlements', async () => {
  const { mosaicPricing, MOSAIC_TESTING_START, MOSAIC_TESTING_END } = await import('../src/lib/mosaic-prices');
  const start = Date.parse(MOSAIC_TESTING_START), end = Date.parse(MOSAIC_TESTING_END);
  assert.equal(mosaicPricing(start - 1).testingFree, false);
  assert.equal(mosaicPricing(start).testingFree, true);
  assert.equal(mosaicPricing(end - 1).controlsCost, 0);
  assert.equal(mosaicPricing(end).controlsCost, 5000);
  const f = fixture(0), now = start + 1000;
  assert.equal(unlockMosaicControls(f.state, {...identity, now}).cost, 0);
  assert.equal(f.player().mosaicControlsUnlockedAt, undefined);
  assert.equal(setMosaicBrush(f.state, {...identity, brush:5, now}).cost, 0);
  assert.equal(f.art.brushUnlockedByPlayer?.['twitch:7'], undefined);
  assert.equal(paintMosaicCell(f.state, {...identity, now, command:parseMosaicPaintCommand('A1Y')!}).paintedCount, 5);
  const before = f.player().gamePointsBalance;
  assert.equal(revealMosaic(f.state, {...identity, now}).cost, 0);
  assert.equal(Date.parse(f.art.revealUntil!), now + 15000);
  assert.equal(f.player().gamePointsBalance, before);
  assert.equal(f.player().lifetimeSpent, 0);
  assert.equal(mosaicPublicSnapshot(f.state, 'tenant', now).pricing.revealCost, 0);
  assert.equal(setMosaicBrush(f.state, {...identity, brush:'status', now:end}).brush, 1);
  assert.throws(() => unlockMosaicControls(f.state, {...identity, now:end}), /Not enough/);
  assert.throws(() => setMosaicBrush(f.state, {...identity, brush:5, now:end}), /Not enough/);
  assert.throws(() => revealMosaic(f.state, {...identity, now:end}), /Not enough/);
});
