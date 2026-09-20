import type { JsonObject } from '@/lib/volume-store';
import { GAME_HUB_CATALOG, getGameHubGame, normalizeGameHubGameIds } from '@/lib/game-hub-registry';

export const GAME_SCORE_INTERVAL_MS = 30_000;
export const GAME_POINTS_INTERVAL_MS = 90_000;
export const PHRASE_GUESS_ROUND_MS = 6 * 60_000;
export const PHRASE_GUESS_HINT_COSTS = [10, 25, 50] as const;
export const PHRASE_GUESS_WIN_POINTS = 50;
export const PHRASE_GUESS_WRONG_COST = 1;
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
  phraseGuessRound?: { roundSlot: number; hintsUsed: number; winnerPlayerId?: string };
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
  const roundSlot = Math.floor(now / PHRASE_GUESS_ROUND_MS);
  const settings = getChannelGameSettings(state, channel);
  const previous = settings.phraseGuessRound || settings.phraseGuessHints;
  const hintsUsed = previous?.roundSlot === roundSlot
    ? Math.max(0, Math.floor(Number(previous.hintsUsed || 0)))
    : 0;
  if (hintsUsed >= PHRASE_GUESS_HINT_COSTS.length) throw new Error('All three hints are already unlocked this round.');

  const player = getOrCreateGameHubPlayer(state, input);
  const cost = PHRASE_GUESS_HINT_COSTS[hintsUsed];
  spendGameHubPoints(state, player, cost, `Phrase Guess hint ${hintsUsed + 1}`);
  settings.phraseGuessRound = {
    roundSlot,
    hintsUsed: hintsUsed + 1,
    ...(settings.phraseGuessRound?.roundSlot === roundSlot && settings.phraseGuessRound.winnerPlayerId
      ? { winnerPlayerId: settings.phraseGuessRound.winnerPlayerId }
      : {}),
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
  const round = phraseGuessRoundAt(now);
  const settings = getChannelGameSettings(state, channel);
  const current = settings.phraseGuessRound?.roundSlot === round.roundSlot
    ? settings.phraseGuessRound
    : { roundSlot: round.roundSlot, hintsUsed: 0 };
  if (current.winnerPlayerId) return { changed: false, outcome: 'closed' as const, roundSlot: round.roundSlot };

  const normalizedGuess = normalizePhraseGuessText(message);
  const match = phraseGuessMatchPercent(normalizedGuess, round.phrase);
  if (match >= 70) {
    current.winnerPlayerId = player.id;
    settings.phraseGuessRound = current;
    membership.score += PHRASE_GUESS_WIN_POINTS;
    membership.wins += 1;
    membership.lastActiveAt = new Date(now).toISOString();
    awardGameHubPoints(state, player, PHRASE_GUESS_WIN_POINTS, 'Phrase Guess solved', { gameId: 'phraseguess', channel });
    return { changed: true, outcome: 'won' as const, match, reward: PHRASE_GUESS_WIN_POINTS, roundSlot: round.roundSlot };
  }

  if (normalizedGuess.length >= 3 && player.gamePointsBalance >= PHRASE_GUESS_WRONG_COST) {
    spendGameHubPoints(state, player, PHRASE_GUESS_WRONG_COST, 'Phrase Guess wrong guess');
    membership.lastActiveAt = new Date(now).toISOString();
    return { changed: true, outcome: 'wrong' as const, match, cost: PHRASE_GUESS_WRONG_COST, roundSlot: round.roundSlot };
  }
  return { changed: false, outcome: 'no-charge' as const, match, roundSlot: round.roundSlot };
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
