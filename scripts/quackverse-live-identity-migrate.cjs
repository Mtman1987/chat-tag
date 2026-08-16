const fs = require('fs');
const path = require('path');

const statePath = '/data/app-state.json';
const backupDir = '/data/backups';
const legacyKey = 'user_94371378';
const splitKey = 'user_d696355b-e13a-408b-b21a-bcfa8dec15e0';
const legacyRaw = legacyKey.replace(/^user_/, '');
const splitRaw = splitKey.replace(/^user_/, '');

const originalStat = fs.statSync(statePath);
const originalText = fs.readFileSync(statePath, 'utf8');
const state = JSON.parse(originalText);

function cardsOf(collection) {
  return Array.isArray(collection?.cards) ? collection.cards : [];
}

function mergeSavedDecks(a, b) {
  const result = [];
  const byId = new Map();
  for (const deck of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
    if (!deck || typeof deck !== 'object') continue;
    const id = String(deck.id || '');
    if (!id) {
      result.push(deck);
      continue;
    }
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, deck);
      result.push(deck);
      continue;
    }
    const existingTime = String(existing.updatedAt || '');
    const incomingTime = String(deck.updatedAt || '');
    if (incomingTime > existingTime) {
      const index = result.indexOf(existing);
      if (index >= 0) result[index] = deck;
      byId.set(id, deck);
    }
  }
  return result;
}

function mergeCollections(legacy, split) {
  const a = legacy || {};
  const b = split || {};
  const aDay = String(a.openedAtDay || '');
  const bDay = String(b.openedAtDay || '');
  const newestDay = [aDay, bDay].filter(Boolean).sort().slice(-1)[0] || '';
  const openedToday =
    aDay && bDay && aDay === bDay
      ? Number(a.openedToday || 0) + Number(b.openedToday || 0)
      : newestDay === bDay
        ? Number(b.openedToday || 0)
        : Number(a.openedToday || 0);
  const preferSplitLastPack = Boolean(
    Array.isArray(b.lastPack) &&
    b.lastPack.length &&
    (!aDay || !bDay || bDay >= aDay)
  );
  return {
    ...b,
    ...a,
    cards: [...cardsOf(a), ...cardsOf(b)],
    openedAtDay: newestDay,
    openedToday,
    lastPack: preferSplitLastPack
      ? [...b.lastPack]
      : Array.isArray(a.lastPack) ? [...a.lastPack] : [],
    deck: Array.isArray(a.deck) && a.deck.length
      ? [...a.deck]
      : Array.isArray(b.deck) ? [...b.deck] : [],
    savedDecks: mergeSavedDecks(a.savedDecks, b.savedDecks),
    activeDeckId: a.activeDeckId || b.activeDeckId || '',
    deckWins: Number(a.deckWins || 0) + Number(b.deckWins || 0),
    deckLosses: Number(a.deckLosses || 0) + Number(b.deckLosses || 0),
  };
}

function migrateQuackverseState(q) {
  if (!q || typeof q !== 'object') return { hadSplit: false };
  if (q.claimedPlayers && typeof q.claimedPlayers === 'object') {
    for (const seat of ['playerOne', 'playerTwo']) {
      if (q.claimedPlayers[seat] === splitKey) q.claimedPlayers[seat] = legacyKey;
    }
  }
  if (!q.collections || typeof q.collections !== 'object') return { hadSplit: false };
  const split = q.collections[splitKey];
  if (!split) return { hadSplit: false };
  const legacy = q.collections[legacyKey];
  q.collections[legacyKey] = legacy ? mergeCollections(legacy, split) : split;
  delete q.collections[splitKey];
  return { hadSplit: true };
}

const root = state.quackverse || (state.quackverse = {});
const rootCollections = root.collections || (root.collections = {});
const legacyBefore = cardsOf(rootCollections[legacyKey]).length;
const splitBefore = cardsOf(rootCollections[splitKey]).length;

if (!rootCollections[legacyKey]) {
  throw new Error(`Historical Quackverse collection ${legacyKey} is missing; refusing migration.`);
}
if (!rootCollections[splitKey]) {
  console.log(JSON.stringify({ status: 'already-migrated', legacyKey, legacyCards: legacyBefore, splitKeyPresent: false }));
  process.exit(0);
}

fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `app-state-quackverse-pre-identity-${stamp}.json`);
fs.writeFileSync(backupPath, originalText, { flag: 'wx' });

migrateQuackverseState(root);
let migratedRooms = 0;
for (const room of Object.values(state.quackverseRooms || {})) {
  const result = migrateQuackverseState(room);
  if (result.hadSplit) migratedRooms += 1;
}

let rewrittenOpenEvents = 0;
if (Array.isArray(state.quackversePackOpens)) {
  for (const event of state.quackversePackOpens) {
    if (!event || typeof event !== 'object') continue;
    if (event.userId === splitKey) {
      event.userId = legacyKey;
      rewrittenOpenEvents += 1;
    } else if (event.userId === splitRaw) {
      event.userId = legacyRaw;
      rewrittenOpenEvents += 1;
    }
  }
}

const currentStat = fs.statSync(statePath);
if (currentStat.mtimeMs !== originalStat.mtimeMs || currentStat.size !== originalStat.size) {
  throw new Error('app-state.json changed during migration preparation; backup kept, live state left untouched.');
}

const tempPath = `${statePath}.tmp.quackverse-identity-${process.pid}`;
fs.writeFileSync(tempPath, JSON.stringify(state, null, 2));
fs.renameSync(tempPath, statePath);

const verified = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const verifiedCollections = verified.quackverse?.collections || {};
const legacyAfter = cardsOf(verifiedCollections[legacyKey]).length;
const splitStillPresent = Boolean(verifiedCollections[splitKey]);
const expected = legacyBefore + splitBefore;
if (legacyAfter !== expected || splitStillPresent) {
  throw new Error(`Verification failed: expected ${expected}, found ${legacyAfter}, splitKeyPresent=${splitStillPresent}`);
}

console.log(JSON.stringify({
  status: 'migrated',
  backupPath,
  legacyKey,
  splitKey,
  legacyBefore,
  splitBefore,
  expectedAfter: expected,
  verifiedAfter: legacyAfter,
  openedToday: verifiedCollections[legacyKey]?.openedToday || 0,
  openedAtDay: verifiedCollections[legacyKey]?.openedAtDay || '',
  lastPack: verifiedCollections[legacyKey]?.lastPack || [],
  migratedRooms,
  rewrittenOpenEvents,
  splitKeyPresent: splitStillPresent,
}));
