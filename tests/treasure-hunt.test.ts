import assert from 'node:assert/strict';
import test from 'node:test';
import {
  answerTreasureRiddle,
  buyTreasurePass,
  digTreasure,
  getTreasureHuntState,
  joinTreasureRotation,
  parseTreasureCoordinate,
  settleTreasureTurn,
  TREASURE_HEIGHT,
  TREASURE_PASS_COST,
  TREASURE_PUZZLE_COUNT,
  TREASURE_TURN_MS,
  TREASURE_RIDDLE_TURN_MS,
  treasureTurnAnnouncement,
  TREASURE_WIDTH,
  treasureHuntPublicSnapshot,
  voteKickTreasureTurn,
} from '../src/lib/treasure-hunt';

const player = { channel: 'space', userId: '1', username: 'player', displayName: 'Player' };

test('touching squares never reveal or claim the treasure, while C3 is hot for D5', () => {
  for (const coordinate of ['C4', 'D4', 'E4', 'C5', 'E5', 'C6', 'D6', 'E6', 'C3']) {
    const draft = state();
    const game = getTreasureHuntState(draft, 'space', 1);
    game.treasureCells = [parseTreasureCoordinate('D5')!.index, 400, 499];
    assert.equal(digTreasure(draft, { ...player, coordinate, now: 2 }).clue, coordinate === 'C3' ? 'hot' : 'boiling');
    const answer = game.activeChallenge!.answers[0];
    const solved = answerTreasureRiddle(draft, { ...player, answer, now: 3 });
    assert.equal(solved.treasureCoordinate, '');
    assert.deepEqual(game.foundCells, []);
    assert.equal(treasureHuntPublicSnapshot(draft, 'space', 3).cells.find(cell => cell.coordinate === 'D5')!.state, 'hidden');
  }
});

test('nearby riddles expose their five-minute deadline and resume normal turns after solving', () => {
  for (const coordinate of ['G5', 'F5', 'E5', 'D5']) {
    const draft = state();
    const game = getTreasureHuntState(draft, 'space', 1);
    game.treasureCells = [parseTreasureCoordinate('D5')!.index, 400, 499];
    digTreasure(draft, { ...player, coordinate, now: 2 });
    joinTreasureRotation(draft, { channel: 'space', userId: '2', username: 'second', displayName: 'Second', now: 3 });
    assert.equal(Date.parse(game.turnExpiresAt!), 2 + TREASURE_RIDDLE_TURN_MS);
    const snapshot = treasureHuntPublicSnapshot(draft, 'space', 100_000);
    assert.equal(snapshot.turn.riddleTurn, true);
    assert.equal(Date.parse(snapshot.turn.expiresAt!), 2 + TREASURE_RIDDLE_TURN_MS);
    assert.equal(snapshot.turn.next?.username, 'Second');
    assert.match(treasureTurnAnnouncement(snapshot), /Player, your turn! Second is up next.*five minutes/);
    assert.equal(settleTreasureTurn(draft, 'space', 100_000).changed, false);
    const answer = game.activeChallenge!.answers[0];
    answerTreasureRiddle(draft, { ...player, answer, now: 100_001 });
    assert.equal(game.rotation[0].displayName, 'Second');
    assert.equal(Date.parse(game.turnExpiresAt!), 100_001 + TREASURE_TURN_MS);
  }
});

test('five-minute riddle timeout still skips the active player and preserves the challenge', () => {
  const draft = state();
  const game = getTreasureHuntState(draft, 'space', 1);
  game.treasureCells = [0, 400, 499];
  digTreasure(draft, { ...player, coordinate: 'B1', now: 2 });
  joinTreasureRotation(draft, { channel: 'space', userId: '2', username: 'second', displayName: 'Second', now: 3 });
  const expired = settleTreasureTurn(draft, 'space', 2 + TREASURE_RIDDLE_TURN_MS);
  assert.equal(expired.skipped?.displayName, 'Player');
  assert.equal(expired.current?.displayName, 'Second');
  assert.equal(game.activeChallenge?.coordinate, 'B1');
  assert.equal(Date.parse(game.turnExpiresAt!), 2 + 2 * TREASURE_RIDDLE_TURN_MS);
});

test('old boiling challenges still require an exact-square dig', () => {
  const draft = state();
  const game = getTreasureHuntState(draft, 'space', 1);
  game.treasureCells = [parseTreasureCoordinate('D5')!.index, 400, 499];
  digTreasure(draft, { ...player, coordinate: 'C3', now: 2 });
  game.activeChallenge!.clue = 'boiling';
  const answer = game.activeChallenge!.answers[0];
  assert.equal(answerTreasureRiddle(draft, { ...player, answer, now: 3 }).treasureCoordinate, '');
  assert.deepEqual(game.foundCells, []);
});

function state() { return { gameSettings: { default: {} } } as any; }

test('Treasure Hunt uses the full 20x25 A1-T25 board', () => {
  assert.equal(TREASURE_WIDTH, 20);
  assert.equal(TREASURE_HEIGHT, 25);
  assert.ok(TREASURE_PUZZLE_COUNT >= TREASURE_WIDTH * TREASURE_HEIGHT, 'one board cannot exhaust the puzzle bank');
  assert.deepEqual(parseTreasureCoordinate('T25'), { coordinate: 'T25', index: 499, row: 24, column: 19 });
  assert.equal(parseTreasureCoordinate('U1'), null);
});

test('Treasure Hunt locks warm, hot, and boiling digs behind riddles with escalating rewards', () => {
  const draft = state();
  const game = getTreasureHuntState(draft, 'space', 1);
  game.treasureCells = [0, 100, 200];

  const cold = digTreasure(draft, { ...player, coordinate: 'T25', now: 2 });
  assert.equal(cold.clue, 'cold');
  assert.equal(cold.digPoints, 1);
  const coldAnswer = getTreasureHuntState(draft, 'space', 2).activeChallenge!.answers[0];
  assert.equal(answerTreasureRiddle(draft, { ...player, answer: coldAnswer, now: 3 }).solvePoints, 10);

  const warm = digTreasure(draft, { ...player, coordinate: 'D1', now: 4 });
  assert.equal(warm.clue, 'warm');
  assert.equal(getTreasureHuntState(draft, 'space', 4).digs.D1.resolved, false);
  const warmAnswer = getTreasureHuntState(draft, 'space', 4).activeChallenge!.answers[0];
  const warmSolved = answerTreasureRiddle(draft, { ...player, answer: warmAnswer, now: 5 });
  assert.equal(warmSolved.digPoints, 10);
  assert.equal(warmSolved.solvePoints, 100);

  assert.equal(digTreasure(draft, { ...player, coordinate: 'C1', now: 6 }).clue, 'hot');
  const hotAnswer = getTreasureHuntState(draft, 'space', 6).activeChallenge!.answers[0];
  assert.equal(answerTreasureRiddle(draft, { ...player, answer: hotAnswer, now: 7 }).solvePoints, 500);

  assert.equal(digTreasure(draft, { ...player, coordinate: 'B1', now: 8 }).clue, 'boiling');
  const boilingAnswer = getTreasureHuntState(draft, 'space', 8).activeChallenge!.answers[0];
  const treasure = answerTreasureRiddle(draft, { ...player, answer: boilingAnswer, now: 9 });
  assert.equal(treasure.solvePoints, 1_000);
  assert.equal(treasure.treasureCoordinate, '');
  assert.equal(treasureHuntPublicSnapshot(draft, 'space', 9).foundCount, 0);
  assert.equal(digTreasure(draft, { ...player, coordinate: 'A1', now: 10 }).clue, 'treasure');
  const exactAnswer = game.activeChallenge!.answers[0];
  assert.equal(answerTreasureRiddle(draft, { ...player, answer: exactAnswer, now: 11 }).treasureCoordinate, 'A1');
  assert.equal(treasureHuntPublicSnapshot(draft, 'space', 11).foundCount, 1);
});

test('three wrong riddle answers rotate the riddle without moving the excavation', () => {
  const draft = state();
  digTreasure(draft, { ...player, coordinate: 'T25', now: 1 });
  const before = getTreasureHuntState(draft, 'space', 1).activeChallenge!;
  answerTreasureRiddle(draft, { ...player, answer: 'definitely wrong one', now: 2 });
  answerTreasureRiddle(draft, { ...player, answer: 'definitely wrong two', now: 3 });
  const third = answerTreasureRiddle(draft, { ...player, answer: 'definitely wrong three', now: 4 });
  const after = getTreasureHuntState(draft, 'space', 4).activeChallenge!;
  assert.equal(third.changedRiddle, true);
  assert.equal(after.coordinate, before.coordinate);
  assert.equal(after.cycle, 1);
  assert.equal(after.wrongGuesses, 0);
});

test('turns last 90 seconds, skipped players rotate, and three skips remove a player', () => {
  const draft = state();
  const second = { channel: 'space', userId: '2', username: 'second', displayName: 'Second' };
  joinTreasureRotation(draft, { ...player, now: 1 });
  joinTreasureRotation(draft, { ...second, now: 2 });

  let game = getTreasureHuntState(draft, 'space', 2);
  assert.equal(game.rotation[0].displayName, 'Player');
  assert.equal(Date.parse(game.turnExpiresAt!), 1 + TREASURE_TURN_MS);

  let result: ReturnType<typeof settleTreasureTurn> | undefined;
  let settledAt = 2;
  for (let index = 0; index < 5; index += 1) {
    game = getTreasureHuntState(draft, 'space', settledAt);
    settledAt = Date.parse(game.turnExpiresAt!) + 1;
    result = settleTreasureTurn(draft, 'space', settledAt);
  }
  assert.equal(result?.dropped?.displayName, 'Player');
  assert.deepEqual(getTreasureHuntState(draft, 'space', settledAt).rotation.map((entry) => entry.displayName), ['Second']);
});

test('joined players can vote an absent boiling-turn player out of the rotation', () => {
  const draft = state();
  const second = { channel: 'space', userId: '2', username: 'second', displayName: 'Second' };
  const third = { channel: 'space', userId: '3', username: 'third', displayName: 'Third' };
  const game = getTreasureHuntState(draft, 'space', 1);
  game.treasureCells = [0, 100, 200];
  assert.equal(digTreasure(draft, { ...player, coordinate: 'B1', now: 2 }).clue, 'boiling');
  joinTreasureRotation(draft, { ...second, now: 3 });
  joinTreasureRotation(draft, { ...third, now: 4 });

  assert.equal(voteKickTreasureTurn(draft, { ...second, now: 5 }).outcome, 'voted');
  const kicked = voteKickTreasureTurn(draft, { ...third, now: 6 });
  assert.equal(kicked.outcome, 'kicked');
  assert.equal(kicked.kicked?.displayName, 'Player');
  assert.equal(kicked.current?.displayName, 'Second');
});

test('Treasure Pass has a fixed price and reveals an exact unfound coordinate', () => {
  const draft = state();
  digTreasure(draft, { ...player, coordinate: 'T25', now: 1 });
  const hubPlayer = draft.gameSettings.default.gameHub.players['twitch:1'];
  hubPlayer.gamePointsBalance = TREASURE_PASS_COST;
  const pass = buyTreasurePass(draft, { ...player, now: 2 });
  assert.equal(pass.outcome, 'purchased');
  assert.match(pass.coordinate || '', /^[A-T](?:2[0-5]|1\d|[1-9])$/);
  assert.equal(draft.gameSettings.default.gameHub.players['twitch:1'].gamePointsBalance, 0);
});
