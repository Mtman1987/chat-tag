import type { JsonObject } from '@/lib/volume-store';
import { GAME_HUB_CATALOG, getGameHubGame, normalizeGameHubGameIds } from '@/lib/game-hub-registry';

export const GAME_SCORE_INTERVAL_MS = 30_000;
export const GAME_POINTS_INTERVAL_MS = 90_000;
export const PHRASE_GUESS_ROUND_MS = 6 * 60_000;
export const PHRASE_GUESS_HINT_COSTS = [10, 25, 50] as const;
export const PHRASE_GUESS_WIN_POINTS = 50;
export const PHRASE_GUESS_WRONG_COST = 1;
export const PHRASE_GUESS_SUBMITTER_REWARD = 5;
export const PHRASE_GUESS_PHRASES = [
  'The quick brown fox jumps over the lazy dog',
  'To be or not to be that is the question',
  'May the force be with you',
  'Houston we have a problem',
  "I'll be back",
  'Life is like a box of chocolates',
  'Show me the money',
  "You can't handle the truth",
  "I'm the king of the world",
  "Here's looking at you kid",
] as const;
export const WORD_CHAIN_ROUND_MS = 6 * 60_000;
export const WORD_CHAIN_VOTE_MS = 20_000;
export const WORD_CHAIN_THEMES = {
  Animals: ['TIGER', 'ELEPHANT', 'MONKEY', 'ZEBRA', 'ANTELOPE', 'EAGLE', 'EMU', 'OTTER', 'RABBIT', 'TURTLE', 'ELK', 'KANGAROO', 'OWL', 'LEMUR', 'RHINO', 'OCTOPUS', 'SNAKE', 'ECHIDNA', 'ALLIGATOR', 'RACCOON', 'NEWT', 'TOUCAN'],
  Food: ['PIZZA', 'BURGER', 'SALAD', 'TACO', 'ORANGE', 'EGG', 'GRAPE', 'ENCHILADA', 'APPLE', 'EDAMAME', 'ECLAIR', 'RICE', 'EMPANADA', 'AVOCADO', 'OLIVE', 'NOODLE', 'LASAGNA', 'ASPARAGUS', 'SOUP', 'POTATO'],
  Gaming: ['MARIO', 'ZELDA', 'SONIC', 'PACMAN', 'ARCADE', 'ESPORT', 'TETRIS', 'SIMULATOR', 'RACING', 'GAME', 'EMOTE', 'ENGINE', 'NPC', 'COMBO', 'ONLINE', 'ENEMY', 'YOSHI', 'ITEM', 'MULTIPLAYER', 'RESPAWN'],
  Nature: ['TREE', 'OCEAN', 'MOUNTAIN', 'RIVER', 'RAINFOREST', 'TORNADO', 'ORCHID', 'DESERT', 'THUNDER', 'REEF', 'FLOWER', 'ROCK', 'KOI', 'ISLAND', 'DAISY', 'YARROW', 'WILLOW', 'WATERFALL', 'LAKE', 'EARTH'],
} as const;
const LEDGER_LIMIT = 500;

export type GameHubMembership = {
  joinedAt: string;
  lastActiveAt?: string;
  lastScoreAt?: string;
  active: boolean;
  score: number;
  wins: number;
  plays: number;
};

export type GameHubPlayer = {
  id: string;
  username: string;
  displayName: string;
  gamePointsBalance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  lastPointsAwardAt?: string;
  joinedGames: Record<string, GameHubMembership>;
};

export type GameHubChannelSettings = {
  extraGameIds: string[];
  stoppedGameIds: string[];
  updatedAt?: string;
  phraseGuessHints?: { roundSlot: number; hintsUsed: number };
  phraseGuessRound?: {
    roundSlot: number;
    hintsUsed: number;
    phraseId?: string;
    phrase?: string;
    submitterPlayerId?: string;
    submitterDisplayName?: string;
    winnerPlayerId?: string;
  };
  phraseGuessInventory?: Array<{
    id: string;
    phrase: string;
    normalized: string;
    submitterPlayerId: string;
    submitterDisplayName: string;
    submittedAt: string;
  }>;
  wordChainRound?: {
    roundSlot: number;
    theme: keyof typeof WORD_CHAIN_THEMES;
    currentWord: string;
    usedWords: string[];
    lastContributorPlayerId?: string;
    comboMultiplier: number;
    pending?: {
      playerId: string;
      username: string;
      displayName: string;
      word: string;
      expectedWord: string;
      closesAt: number;
      votes: Record<string, boolean>;
    };
  };
  wordChainVerdicts?: Record<string, boolean>;
};

export type GameHubLedgerEntry = {
  at: string;
  playerId: string;
  amount: number;
  reason: string;
  gameId?: string;
  channel?: string;
};

export type GameHubStore = {
  channels: Record<string, GameHubChannelSettings>;
  players: Record<string, GameHubPlayer>;
  ledger: GameHubLedgerEntry[];
};

export function normalizeGameHubChannel(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/^#/, '').slice(0, 80);
}

export function normalizeGameHubPlayerId(userId: unknown, username?: unknown): string {
  const raw = String(userId || '').trim().replace(/^user_/, '');
  if (raw) return `twitch:${raw}`;
  const login = normalizeGameHubChannel(username);
  return login ? `login:${login}` : '';
}

export function getGameHubStore(state: any): GameHubStore {
  state.gameSettings ||= { default: {} };
  state.gameSettings.default ||= {};
  const root = (state.gameSettings.default.gameHub ||= {}) as JsonObject;
  root.channels ||= {};
  root.players ||= {};
  root.ledger ||= [];
  return root as GameHubStore;
}

function profileGameIdsForChannel(state: any, channel: string): string[] {
  const profiles = (state.gameSettings?.default?.gameHubOverlayProfiles || {}) as Record<string, JsonObject>;
  const ids: string[] = [];
  for (const value of Object.values(profiles)) {
    if (normalizeGameHubChannel(value?.ownerLogin) !== channel) continue;
    ids.push(...normalizeGameHubGameIds(value?.gameIds, 50));
  }
  return normalizeGameHubGameIds(ids, 50);
}

export function getChannelGameSettings(state: any, channelValue: unknown): GameHubChannelSettings {
  const channel = normalizeGameHubChannel(channelValue);
  const store = getGameHubStore(state);
  const current = store.channels[channel] || { extraGameIds: [], stoppedGameIds: [] };
  current.extraGameIds = normalizeGameHubGameIds(current.extraGameIds, 50);
  current.stoppedGameIds = normalizeGameHubGameIds(current.stoppedGameIds, 50);
  if (channel) store.channels[channel] = current;
  return current;
}

export function resolveChannelGameIds(state: any, channelValue: unknown): string[] {
  const channel = normalizeGameHubChannel(channelValue);
  if (!channel) return [];
  const settings = getChannelGameSettings(state, channel);
  const configured = normalizeGameHubGameIds([
    ...profileGameIdsForChannel(state, channel),
    ...settings.extraGameIds,
  ], 50);
  const stopped = new Set(settings.stoppedGameIds);
  return configured.filter((gameId) => !stopped.has(gameId));
}

export function setChannelGameRunning(state: any, channelValue: unknown, gameIdValue: unknown, running: boolean) {
  const channel = normalizeGameHubChannel(channelValue);
  const game = getGameHubGame(String(gameIdValue || ''));
  if (!channel || !game) throw new Error('Valid channel and game are required.');
  const settings = getChannelGameSettings(state, channel);
  const extras = new Set(settings.extraGameIds);
  const stopped = new Set(settings.stoppedGameIds);
  extras.add(game.id);
  if (running) stopped.delete(game.id);
  else stopped.add(game.id);
  settings.extraGameIds = normalizeGameHubGameIds([...extras], 50);
  settings.stoppedGameIds = normalizeGameHubGameIds([...stopped], 50);
  settings.updatedAt = new Date().toISOString();
  return settings;
}

function normalizeMembership(value: any): GameHubMembership {
  return {
    joinedAt: String(value?.joinedAt || new Date().toISOString()),
    lastActiveAt: value?.lastActiveAt ? String(value.lastActiveAt) : undefined,
    lastScoreAt: value?.lastScoreAt ? String(value.lastScoreAt) : undefined,
    active: value?.active !== false,
    score: Math.max(0, Number(value?.score || 0)),
    wins: Math.max(0, Number(value?.wins || 0)),
    plays: Math.max(0, Number(value?.plays || 0)),
  };
}

export function getOrCreateGameHubPlayer(
  state: any,
  input: { userId?: unknown; username?: unknown; displayName?: unknown },
): GameHubPlayer {
  const id = normalizeGameHubPlayerId(input.userId, input.username);
  if (!id) throw new Error('A Twitch player identity is required.');
  const store = getGameHubStore(state);
  const existing = store.players[id] || {} as any;
  const username = normalizeGameHubChannel(input.username || existing.username);
  const displayName = String(input.displayName || existing.displayName || username).trim().slice(0, 80) || username;
  const joinedGames: Record<string, GameHubMembership> = {};
  for (const [gameId, membership] of Object.entries(existing.joinedGames || {})) {
    if (!getGameHubGame(gameId)) continue;
    joinedGames[gameId] = normalizeMembership(membership);
  }
  const player: GameHubPlayer = {
    id,
    username,
    displayName,
    gamePointsBalance: Math.max(0, Number(existing.gamePointsBalance || 0)),
    lifetimeEarned: Math.max(0, Number(existing.lifetimeEarned || 0)),
    lifetimeSpent: Math.max(0, Number(existing.lifetimeSpent || 0)),
    lastPointsAwardAt: existing.lastPointsAwardAt ? String(existing.lastPointsAwardAt) : undefined,
    joinedGames,
  };
  store.players[id] = player;
  return player;
}

export function joinGameHubGame(
  state: any,
  input: { userId?: unknown; username?: unknown; displayName?: unknown; gameId: string },
) {
  const game = getGameHubGame(input.gameId);
  if (!game) throw new Error('Unknown game.');
  const player = getOrCreateGameHubPlayer(state, input);
  const existing = player.joinedGames[game.id];
  const alreadyJoined = Boolean(existing?.active);
  if (!existing) {
    player.joinedGames[game.id] = {
      joinedAt: new Date().toISOString(),
      active: true,
      score: 0,
      wins: 0,
      plays: 1,
    };
  } else if (!existing.active) {
    existing.active = true;
    existing.plays += 1;
  }
  return { player, membership: player.joinedGames[game.id], alreadyJoined };
}

export function leaveGameHubGame(state: any, playerId: string, gameId: string): boolean {
  const store = getGameHubStore(state);
  const membership = store.players[playerId]?.joinedGames?.[gameId];
  if (!membership?.active) return false;
  membership.active = false;
  membership.lastActiveAt = new Date().toISOString();
  return true;
}

function appendLedger(store: GameHubStore, entry: GameHubLedgerEntry) {
  store.ledger.push(entry);
  store.ledger = store.ledger.slice(-LEDGER_LIMIT);
}

export function awardGameHubPoints(
  state: any,
  player: GameHubPlayer,
  amountValue: number,
  reason: string,
  extra: { gameId?: string; channel?: string } = {},
) {
  const amount = Math.max(0, Math.floor(Number(amountValue || 0)));
  if (!amount) return player;
  player.gamePointsBalance += amount;
  player.lifetimeEarned += amount;
  appendLedger(getGameHubStore(state), {
    at: new Date().toISOString(),
    playerId: player.id,
    amount,
    reason: String(reason || 'gameplay').slice(0, 160),
    gameId: extra.gameId,
    channel: extra.channel,
  });
  return player;
}

export function spendGameHubPoints(
  state: any,
  player: GameHubPlayer,
  amountValue: number,
  reason: string,
) {
  const amount = Math.max(1, Math.floor(Number(amountValue || 0)));
  if (player.gamePointsBalance < amount) throw new Error('Not enough Games Points.');
  player.gamePointsBalance -= amount;
  player.lifetimeSpent += amount;
  appendLedger(getGameHubStore(state), {
    at: new Date().toISOString(),
    playerId: player.id,
    amount: -amount,
    reason: String(reason || 'Nebula Arcade purchase').slice(0, 160),
  });
  return player;
}

export function purchasePhraseGuessHint(
  state: any,
  input: { channel: unknown; userId?: unknown; username?: unknown; displayName?: unknown; now?: number },
) {
  const channel = normalizeGameHubChannel(input.channel);
  if (!channel) throw new Error('A channel is required.');
  const now = Math.max(0, Math.floor(Number(input.now ?? Date.now())));
  const settings = getChannelGameSettings(state, channel);
  const activeRound = phraseGuessRoundForChannel(state, channel, now);
  const roundSlot = activeRound.roundSlot;
  const previous = settings.phraseGuessRound || settings.phraseGuessHints;
  const hintsUsed = Math.max(0, Math.floor(Number(previous?.hintsUsed || 0)));
  if (hintsUsed >= PHRASE_GUESS_HINT_COSTS.length) throw new Error('All three hints are already unlocked this round.');

  const player = getOrCreateGameHubPlayer(state, input);
  const cost = PHRASE_GUESS_HINT_COSTS[hintsUsed];
  spendGameHubPoints(state, player, cost, `Phrase Guess hint ${hintsUsed + 1}`);
  settings.phraseGuessRound = {
    ...activeRound,
    roundSlot,
    hintsUsed: hintsUsed + 1,
  };
  delete settings.phraseGuessHints;
  settings.updatedAt = new Date(now).toISOString();
  return { tier: hintsUsed + 1, cost, balance: player.gamePointsBalance, roundSlot };
}

function normalizePhraseGuessText(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

function phraseGuessMatchPercent(guessValue: unknown, targetValue: unknown): number {
  const guessWords = normalizePhraseGuessText(guessValue).split(/\s+/).filter(Boolean);
  const targetWords = normalizePhraseGuessText(targetValue).split(/\s+/).filter(Boolean);
  if (!guessWords.length || !targetWords.length) return 0;
  let matches = 0;
  for (const guess of guessWords) {
    if (targetWords.includes(guess)) matches += 1;
  }
  return Math.floor((matches / Math.max(guessWords.length, targetWords.length)) * 100);
}

export function phraseGuessRoundAt(nowValue: number) {
  const now = Math.max(0, Math.floor(Number(nowValue || 0)));
  const roundSlot = Math.floor(now / PHRASE_GUESS_ROUND_MS);
  return {
    roundSlot,
    phrase: PHRASE_GUESS_PHRASES[roundSlot % PHRASE_GUESS_PHRASES.length],
  };
}

export function phraseGuessRoundForChannel(state: any, channelValue: unknown, nowValue = Date.now()) {
  const channel = normalizeGameHubChannel(channelValue);
  const settings = getChannelGameSettings(state, channel);
  const round = phraseGuessRoundAt(nowValue);
  if (settings.phraseGuessRound?.roundSlot === round.roundSlot && settings.phraseGuessRound.phrase) {
    return settings.phraseGuessRound;
  }
  const inventory = Array.isArray(settings.phraseGuessInventory) ? settings.phraseGuessInventory : [];
  const communityTurn = inventory.length > 0 && round.roundSlot % 3 === 2;
  const submission = communityTurn ? inventory[Math.floor(round.roundSlot / 3) % inventory.length] : null;
  settings.phraseGuessRound = {
    roundSlot: round.roundSlot,
    hintsUsed: 0,
    phraseId: submission?.id || `canonical:${round.roundSlot % PHRASE_GUESS_PHRASES.length}`,
    phrase: submission?.phrase || round.phrase,
    ...(submission ? {
      submitterPlayerId: submission.submitterPlayerId,
      submitterDisplayName: submission.submitterDisplayName,
    } : {}),
  };
  return settings.phraseGuessRound;
}

export function submitPhraseGuessPhrase(
  state: any,
  input: { channel: unknown; userId?: unknown; username?: unknown; displayName?: unknown; phrase: unknown; now?: number },
) {
  const channel = normalizeGameHubChannel(input.channel);
  if (!channel) throw new Error('A channel is required.');
  const phrase = String(input.phrase || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  const normalized = normalizePhraseGuessText(phrase);
  if (normalized.length < 5 || normalized.split(/\s+/).length < 2) throw new Error('Submit a phrase with at least two words.');
  const now = Math.max(0, Math.floor(Number(input.now ?? Date.now())));
  const settings = getChannelGameSettings(state, channel);
  phraseGuessRoundForChannel(state, channel, now);
  settings.phraseGuessInventory ||= [];
  if (settings.phraseGuessInventory.some((entry) => entry.normalized === normalized)
    || PHRASE_GUESS_PHRASES.some((entry) => normalizePhraseGuessText(entry) === normalized)) {
    throw new Error('That phrase is already in the Phrase Guess inventory.');
  }
  const player = getOrCreateGameHubPlayer(state, input);
  const submittedAt = new Date(now).toISOString();
  const entry = {
    id: `phrase:${player.id}:${now}`,
    phrase,
    normalized,
    submitterPlayerId: player.id,
    submitterDisplayName: player.displayName,
    submittedAt,
  };
  settings.phraseGuessInventory = [...settings.phraseGuessInventory, entry].slice(-100);
  settings.updatedAt = submittedAt;
  return { entry, inventorySize: settings.phraseGuessInventory.length };
}

export function recordPhraseGuessAttempt(
  state: any,
  input: { channel: unknown; userId?: unknown; username?: unknown; displayName?: unknown; message?: unknown; now?: number },
) {
  const channel = normalizeGameHubChannel(input.channel);
  const message = String(input.message || '').trim();
  if (!channel || !message || /^!?@?spmt(?:\s|$)/i.test(message)) return { changed: false, outcome: 'ignored' as const };

  const player = getOrCreateGameHubPlayer(state, input);
  const membership = player.joinedGames.phraseguess;
  if (!membership?.active) return { changed: false, outcome: 'not-playing' as const };

  const now = Math.max(0, Math.floor(Number(input.now ?? Date.now())));
  const settings = getChannelGameSettings(state, channel);
  const current = phraseGuessRoundForChannel(state, channel, now);
  if (current.winnerPlayerId) return { changed: false, outcome: 'closed' as const, roundSlot: current.roundSlot };

  const normalizedGuess = normalizePhraseGuessText(message);
  const match = phraseGuessMatchPercent(normalizedGuess, current.phrase);
  if (match >= 70) {
    current.winnerPlayerId = player.id;
    settings.phraseGuessRound = current;
    membership.score += PHRASE_GUESS_WIN_POINTS;
    membership.wins += 1;
    membership.lastActiveAt = new Date(now).toISOString();
    awardGameHubPoints(state, player, PHRASE_GUESS_WIN_POINTS, 'Phrase Guess solved', { gameId: 'phraseguess', channel });
    let submitterReward = 0;
    if (current.submitterPlayerId) {
      const submitter = getGameHubStore(state).players[current.submitterPlayerId];
      if (submitter) {
        submitterReward = PHRASE_GUESS_SUBMITTER_REWARD;
        awardGameHubPoints(state, submitter, submitterReward, 'Phrase Guess submission attribution', { gameId: 'phraseguess', channel });
      }
    }
    return { changed: true, outcome: 'won' as const, match, reward: PHRASE_GUESS_WIN_POINTS, submitterReward, roundSlot: current.roundSlot };
  }

  if (normalizedGuess.length >= 3 && player.gamePointsBalance >= PHRASE_GUESS_WRONG_COST) {
    spendGameHubPoints(state, player, PHRASE_GUESS_WRONG_COST, 'Phrase Guess wrong guess');
    membership.lastActiveAt = new Date(now).toISOString();
    return { changed: true, outcome: 'wrong' as const, match, cost: PHRASE_GUESS_WRONG_COST, roundSlot: current.roundSlot };
  }
  return { changed: false, outcome: 'no-charge' as const, match, roundSlot: current.roundSlot };
}

export function wordChainRoundAt(nowValue: number) {
  const now = Math.max(0, Math.floor(Number(nowValue || 0)));
  const roundSlot = Math.floor(now / WORD_CHAIN_ROUND_MS);
  const themeNames = Object.keys(WORD_CHAIN_THEMES) as Array<keyof typeof WORD_CHAIN_THEMES>;
  const theme = themeNames[roundSlot % themeNames.length];
  const words = WORD_CHAIN_THEMES[theme];
  const seedIndex = Math.floor(roundSlot / themeNames.length) % words.length;
  return { roundSlot, theme, seed: words[seedIndex] };
}

function normalizedWordChainMessage(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function wordChainStateForRound(settings: GameHubChannelSettings, now: number) {
  const round = wordChainRoundAt(now);
  if (settings.wordChainRound?.roundSlot === round.roundSlot) return settings.wordChainRound;
  settings.wordChainRound = {
    roundSlot: round.roundSlot,
    theme: round.theme,
    currentWord: round.seed,
    usedWords: [round.seed],
    comboMultiplier: 1,
  };
  return settings.wordChainRound;
}

function applyWordChainWord(
  state: any,
  channel: string,
  round: NonNullable<GameHubChannelSettings['wordChainRound']>,
  player: GameHubPlayer,
  word: string,
  now: number,
) {
  const membership = player.joinedGames.wordchain;
  if (!membership?.active || round.usedWords.includes(word)) return null;
  const combo = player.id === round.lastContributorPlayerId
    ? Math.min(round.comboMultiplier + 0.5, 3)
    : 1;
  const points = Math.floor(word.length * combo);
  round.currentWord = word;
  round.usedWords = [...round.usedWords, word].slice(-100);
  round.lastContributorPlayerId = player.id;
  round.comboMultiplier = combo;
  membership.score += points;
  membership.lastActiveAt = new Date(now).toISOString();
  awardGameHubPoints(state, player, points, 'Word Chain accepted word', { gameId: 'wordchain', channel });
  return { points, combo };
}

export function recordWordChainMessage(
  state: any,
  input: { channel: unknown; userId?: unknown; username?: unknown; displayName?: unknown; message?: unknown; now?: number },
) {
  const channel = normalizeGameHubChannel(input.channel);
  const message = String(input.message || '').trim();
  if (!channel || !message || /^!?@?spmt(?:\s|$)/i.test(message)) return { changed: false, outcome: 'ignored' as const };
  const now = Math.max(0, Math.floor(Number(input.now ?? Date.now())));
  const settings = getChannelGameSettings(state, channel);
  const round = wordChainStateForRound(settings, now);
  let finalized: { accepted: boolean; word: string; points?: number } | null = null;

  if (round.pending && now >= round.pending.closesAt) {
    const pending = round.pending;
    delete round.pending;
    const votes = Object.values(pending.votes);
    const yes = votes.filter(Boolean).length;
    const no = votes.length - yes;
    const accepted = votes.length === 0 || yes >= no;
    settings.wordChainVerdicts ||= {};
    settings.wordChainVerdicts[`${round.theme}:${pending.word}`] = accepted;
    const verdictEntries = Object.entries(settings.wordChainVerdicts).slice(-500);
    settings.wordChainVerdicts = Object.fromEntries(verdictEntries);
    const pendingPlayer = getGameHubStore(state).players[pending.playerId];
    const applied = accepted && pendingPlayer && round.currentWord === pending.expectedWord
      ? applyWordChainWord(state, channel, round, pendingPlayer, pending.word, now)
      : null;
    finalized = { accepted: Boolean(applied), word: pending.word, ...(applied ? { points: applied.points } : {}) };
  }

  const normalized = normalizedWordChainMessage(message);
  if (round.pending && /^(YES|Y|ACCEPT|NO|N|REJECT)$/.test(normalized)) {
    const voterId = normalizeGameHubPlayerId(input.userId, input.username);
    if (voterId && !Object.prototype.hasOwnProperty.call(round.pending.votes, voterId)) {
      round.pending.votes[voterId] = /^(YES|Y|ACCEPT)$/.test(normalized);
      return { changed: true, outcome: 'voted' as const, finalized };
    }
    return { changed: Boolean(finalized), outcome: 'duplicate-vote' as const, finalized };
  }

  const player = getOrCreateGameHubPlayer(state, input);
  const membership = player.joinedGames.wordchain;
  if (!membership?.active) return { changed: Boolean(finalized), outcome: 'not-playing' as const, finalized };
  if (!/^[A-Z]+$/.test(normalized) || normalized.length < 3) return { changed: Boolean(finalized), outcome: 'invalid' as const, finalized };
  if (normalized[0] !== round.currentWord.at(-1)) return { changed: Boolean(finalized), outcome: 'wrong-letter' as const, finalized };
  if (round.usedWords.includes(normalized)) return { changed: Boolean(finalized), outcome: 'used' as const, finalized };

  const verdictKey = `${round.theme}:${normalized}`;
  const canonical = (WORD_CHAIN_THEMES[round.theme] as readonly string[]).includes(normalized);
  const cachedVerdict = settings.wordChainVerdicts?.[verdictKey];
  if (canonical || cachedVerdict === true) {
    const applied = applyWordChainWord(state, channel, round, player, normalized, now);
    return { changed: Boolean(applied) || Boolean(finalized), outcome: 'accepted' as const, finalized, ...applied };
  }
  if (cachedVerdict === false) return { changed: Boolean(finalized), outcome: 'rejected' as const, finalized };
  if (round.pending) return { changed: Boolean(finalized), outcome: 'vote-busy' as const, finalized };

  round.pending = {
    playerId: player.id,
    username: player.username,
    displayName: player.displayName,
    word: normalized,
    expectedWord: round.currentWord,
    closesAt: now + WORD_CHAIN_VOTE_MS,
    votes: {},
  };
  return { changed: true, outcome: 'vote-opened' as const, closesAt: round.pending.closesAt, finalized };
}

export function recordGameHubChatActivity(
  state: any,
  input: { channel: string; userId?: unknown; username?: unknown; displayName?: unknown; message?: unknown },
) {
  const channel = normalizeGameHubChannel(input.channel);
  const activeGameIds = resolveChannelGameIds(state, channel);
  if (!activeGameIds.length) return { activeGameIds, scoredGameIds: [], pointsAwarded: 0 };

  const playerId = normalizeGameHubPlayerId(input.userId, input.username);
  const store = getGameHubStore(state);
  const existing = store.players[playerId];
  if (!existing) return { activeGameIds, scoredGameIds: [], pointsAwarded: 0 };
  const player = getOrCreateGameHubPlayer(state, input);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const scoredGameIds: string[] = [];

  for (const gameId of activeGameIds) {
    if (gameId === 'chatwars' || gameId === 'treasurehunt' || gameId === 'bingo') continue;
    const membership = player.joinedGames[gameId];
    if (!membership?.active) continue;
    const lastScoreAt = Date.parse(String(membership.lastScoreAt || 0));
    if (!Number.isFinite(lastScoreAt) || now - lastScoreAt >= GAME_SCORE_INTERVAL_MS) {
      membership.lastActiveAt = nowIso;
      membership.score += 1;
      membership.lastScoreAt = nowIso;
      scoredGameIds.push(gameId);
    }
  }

  let pointsAwarded = 0;
  if (scoredGameIds.length && !/^\s*!?@?spmt\b/i.test(String(input.message || ''))) {
    const lastPointsAt = Date.parse(String(player.lastPointsAwardAt || 0));
    if (!Number.isFinite(lastPointsAt) || now - lastPointsAt >= GAME_POINTS_INTERVAL_MS) {
      pointsAwarded = 1;
      player.lastPointsAwardAt = nowIso;
      awardGameHubPoints(state, player, 1, 'Active Nebula Arcade participation', { channel });
    }
  }

  return { activeGameIds, scoredGameIds, pointsAwarded, player };
}

export function getGameHubGameStats(state: any, gameId: string) {
  const game = getGameHubGame(gameId);
  if (!game) throw new Error('Unknown game.');
  const store = getGameHubStore(state);
  const players = Object.values(store.players)
    .filter((player) => Boolean(player.joinedGames?.[game.id]))
    .map((player) => ({
      id: player.id,
      username: player.username,
      displayName: player.displayName,
      gamePointsBalance: player.gamePointsBalance,
      ...normalizeMembership(player.joinedGames[game.id]),
    }));
  const leaderboard = [...players]
    .sort((a, b) => b.score - a.score || b.wins - a.wins || a.joinedAt.localeCompare(b.joinedAt))
    .slice(0, 50);
  const playerList = players
    .filter((player) => player.active)
    .sort((a, b) => (b.lastActiveAt || '').localeCompare(a.lastActiveAt || '') || a.displayName.localeCompare(b.displayName))
    .slice(0, 100);
  return { game, leaderboard, players: playerList };
}

export function gameCatalogIds() {
  return GAME_HUB_CATALOG.map((game) => game.id);
}
