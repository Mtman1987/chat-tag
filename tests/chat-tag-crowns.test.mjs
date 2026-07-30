import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { crownName, decorateCrowns, decorateCrownsDeep, getWinners } = require('../src/lib/chat-tag-crowns.js');

const winners = [
  { userId: 'u1', username: 'niniav23', place: 1, month: 'July 2026' },
  { userId: 'u2', username: 'van_braak', place: 2, month: 'July 2026' },
  { userId: 'u3', username: 'scarlett_ai420', place: 3, month: 'July 2026' },
];

test('crowns every winner mentioned in a message', () => {
  assert.equal(
    decorateCrowns('🎯 niniav23 tagged @van_braak who is now it!', winners),
    '🎯 👑niniav23 tagged 👑@van_braak who is now it!'
  );
});

test('crown goes before the @ so chat mentions still ping', () => {
  assert.equal(decorateCrowns('@van_braak Rank: #2', winners), '👑@van_braak Rank: #2');
});

test('non-winners are untouched', () => {
  assert.equal(decorateCrowns('mtman1987 tagged pinscorpion6521', winners), 'mtman1987 tagged pinscorpion6521');
});

test('never double-crowns an already crowned name', () => {
  assert.equal(decorateCrowns('👑niniav23 is now IT!', winners), '👑niniav23 is now IT!');
  assert.equal(
    decorateCrowns("Last month's crowns: 👑#1 niniav23 | 👑#2 van_braak", winners),
    "Last month's crowns: 👑#1 niniav23 | 👑#2 van_braak"
  );
});

test('matches whole names only and skips urls', () => {
  assert.equal(decorateCrowns('niniav234 tagged niniav23_alt', winners), 'niniav234 tagged niniav23_alt');
  assert.equal(
    decorateCrowns('https://twitch.tv/niniav23 is live', winners),
    'https://twitch.tv/niniav23 is live'
  );
});

test('matches spaced and compact spellings of a winner name', () => {
  assert.equal(decorateCrowns('van braak tagged vanbraak', winners), '👑van braak tagged 👑vanbraak');
});

test('crowns follow the current winner list so they move each month', () => {
  const nextMonth = [{ userId: 'u9', username: 'pinscorpion6521', place: 1, month: 'August 2026' }];
  assert.equal(decorateCrowns('niniav23 tagged pinscorpion6521', nextMonth), 'niniav23 tagged 👑pinscorpion6521');
  assert.equal(decorateCrowns('niniav23 tagged pinscorpion6521', []), 'niniav23 tagged pinscorpion6521');
});

test('crownName crowns a bare username idempotently', () => {
  assert.equal(crownName('niniav23', winners), '👑niniav23');
  assert.equal(crownName('👑niniav23', winners), '👑niniav23');
  assert.equal(crownName('mtman1987', winners), 'mtman1987');
});

test('decorateCrownsDeep crowns nested payloads but leaves urls and ids alone', () => {
  const payload = {
    tagger: 'niniav23',
    tagged: 'mtman1987',
    rows: [{ rank: 1, username: 'van_braak', score: 10 }],
    url: 'https://example.com/niniav23',
    custom_id: 'tag:niniav23',
  };

  assert.deepEqual(decorateCrownsDeep(payload, winners), {
    tagger: '👑niniav23',
    tagged: 'mtman1987',
    rows: [{ rank: 1, username: '👑van_braak', score: 10 }],
    url: 'https://example.com/niniav23',
    custom_id: 'tag:niniav23',
  });
});

test('getWinners reads winners from app state or a plain list', () => {
  assert.equal(getWinners({ tagGame: { state: { monthlyWinners: winners } } }).length, 3);
  assert.equal(getWinners({ monthlyWinners: winners })[0].place, 1);
  assert.deepEqual(getWinners(null), []);
});
