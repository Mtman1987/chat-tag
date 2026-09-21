import { commonBingoPhrases } from '@/lib/bingo-data';
import {
  awardGameHubPoints,
  getChannelGameSettings,
  getGameHubStore,
  joinGameHubGame,
  normalizeGameHubChannel,
  spendGameHubPoints,
} from '@/lib/game-hub-state';

export const SHARED_BINGO_GAME_ID = 'bingo';
export const BINGO_CLAIM_WINDOW_MS = 15_000;
export const BINGO_CLAIM_POINTS = 5;
export const BINGO_RECLAIM_POINTS = 5;
export const BINGO_PARTICIPATION_BONUS = 5;
export const BINGO_STREAMER_BONUS = 25;
export const BINGO_PHRASE_CHANGE_COST = 100;
export const BINGO_STELLA_FLIP_COST = 250;
export const BINGO_CENTER_FREE_COST = 500;

type BingoSquareStatus = 'open' | 'pending' | 'chat' | 'stella' | 'replacement';

type SharedBingoSquare = {
  coordinate: string;
  phrase: string;
  status: BingoSquareStatus;
  triggeredAt?: string;
  claimUntil?: string;
  claimedBy?: string;
  suggestedBy?: string;
  originalPhrase?: string;
};

type SharedBingoState = {
  boardId: string;
  squares: SharedBingoSquare[];
  participants: Record<string, { username: string; displayName: string; actions: number }>;
  recentTranscripts: string[];
  completedAt?: string;
  winningLine?: string[];
  updatedAt: string;
};

const DEFAULT_SPOKEN_PHRASES = [
  'hello chat', 'let us go', 'oh no', 'one more time', 'thank you',
  'good game', 'that was close', 'I knew it', 'no way', 'we got this',
  'be right back', 'welcome in', 'what happened', 'that is wild', 'I need water',
  'nice', 'seriously', 'come on', 'I cannot believe it', 'here we go',
  'my bad', 'good morning', 'good night', 'you are kidding', 'bingo',
];

const WINNING_LINES = [
  [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23], [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24], [4, 8, 12, 16, 20],
];

function coordinateAt(index: number) {
  return `${String.fromCharCode(65 + (index % 5))}${Math.floor(index / 5) + 1}`;
}

export function parseBingoCoordinate(value: unknown) {
  const match = String(value || '').trim().toUpperCase().match(/^([A-E])\s*([1-5])$/);
  if (!match) return null;
  const column = match[1].charCodeAt(0) - 65;
  const row = Number(match[2]) - 1;
  return { coordinate: `${match[1]}${match[2]}`, index: row * 5 + column };
}

function normalizePhrase(value: unknown) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9']+/g, ' ').replace(/\s+/g, ' ').trim();
}

function phraseSource(state: any) {
  const configured = Array.isArray(state.bingoCards?.current_user?.phrases)
    ? state.bingoCards.current_user.phrases.map((value: unknown) => String(value || '').trim()).filter(Boolean)
    : [];
  const source = configured.length >= 25 && configured.some((phrase: string) => !/^streamer\s+(?:mentions|dies|drinks|laughs|sneezes|stretches|yawns)/i.test(phrase))
    ? configured
    : DEFAULT_SPOKEN_PHRASES;
  return Array.from({ length: 25 }, (_, index) => String(source[index] || commonBingoPhrases[index] || `Phrase ${index + 1}`).slice(0, 80));
}

function makeState(state: any, channel: string, now: number): SharedBingoState {
  const boardId = `${channel}:${new Date(now).toISOString().slice(0, 10)}`;
  return {
    boardId,
    squares: phraseSource(state).map((phrase, index) => ({ coordinate: coordinateAt(index), phrase, status: 'open' })),
    participants: {},
    recentTranscripts: [],
    updatedAt: new Date(now).toISOString(),
  };
}

export function getSharedBingoState(state: any, channelValue: unknown, now = Date.now()) {
  const channel = normalizeGameHubChannel(channelValue);
  const settings = getChannelGameSettings(state, channel) as any;
  const current = settings.sharedBingo as SharedBingoState | undefined;
  const expected = `${channel}:${new Date(now).toISOString().slice(0, 10)}`;
  if (!current || current.boardId !== expected || !Array.isArray(current.squares) || current.squares.length !== 25) {
    settings.sharedBingo = makeState(state, channel, now);
  }
  return settings.sharedBingo as SharedBingoState;
}

function lineFor(game: SharedBingoState) {
  const line = WINNING_LINES.find((indices) => indices.every((index) => game.squares[index]?.status === 'chat'));
  return line?.map((index) => game.squares[index].coordinate) || null;
}

export function settleExpiredBingoClaims(state: any, channelValue: unknown, now = Date.now()) {
  const game = getSharedBingoState(state, channelValue, now);
  const blocked: string[] = [];
  for (const square of game.squares) {
    if (square.status !== 'pending' || !square.claimUntil || Date.parse(square.claimUntil) > now) continue;
    square.status = 'stella';
    delete square.claimUntil;
    blocked.push(square.coordinate);
  }
  if (blocked.length) game.updatedAt = new Date(now).toISOString();
  return { changed: blocked.length > 0, blocked };
}

export function ingestBingoTranscript(state: any, input: { channel: unknown; text: unknown; now?: number }) {
  const now = Number(input.now ?? Date.now());
  const channel = normalizeGameHubChannel(input.channel);
  const settled = settleExpiredBingoClaims(state, channel, now);
  const game = getSharedBingoState(state, channel, now);
  const transcript = normalizePhrase(input.text);
  if (!transcript || game.recentTranscripts.includes(transcript)) return { changed: settled.changed, blocked: settled.blocked, triggered: [] as string[] };
  game.recentTranscripts = [...game.recentTranscripts, transcript].slice(-50);
  const triggered: string[] = [];
  for (const square of game.squares) {
    if (square.status !== 'open' && square.status !== 'replacement') continue;
    const phrase = normalizePhrase(square.phrase);
    if (phrase.length < 2 || !transcript.includes(phrase)) continue;
    square.status = 'pending';
    square.triggeredAt = new Date(now).toISOString();
    square.claimUntil = new Date(now + BINGO_CLAIM_WINDOW_MS).toISOString();
    triggered.push(square.coordinate);
  }
  if (triggered.length) game.updatedAt = new Date(now).toISOString();
  return { changed: true, blocked: settled.blocked, triggered };
}

function participant(game: SharedBingoState, player: any) {
  return (game.participants[player.id] ||= { username: player.username, displayName: player.displayName, actions: 0 });
}

function completeBingoIfWon(state: any, game: SharedBingoState, joined: any, channel: string, now: number) {
  const winningLine = lineFor(game);
  if (!winningLine || game.completedAt) return { won: false, winningLine };
  game.completedAt = new Date(now).toISOString();
  game.winningLine = winningLine;
  joined.membership.wins += 1;
  const store = getGameHubStore(state);
  for (const playerId of Object.keys(game.participants)) {
    const player = store.players[playerId];
    if (!player) continue;
    const membership = player.joinedGames?.[SHARED_BINGO_GAME_ID];
    if (membership) membership.score += BINGO_PARTICIPATION_BONUS;
    awardGameHubPoints(state, player, BINGO_PARTICIPATION_BONUS, 'Shared Bingo participation bonus', { gameId: SHARED_BINGO_GAME_ID, channel });
  }
  const streamer = joinGameHubGame(state, { username: channel, displayName: channel, gameId: SHARED_BINGO_GAME_ID });
  streamer.membership.score += BINGO_STREAMER_BONUS;
  awardGameHubPoints(state, streamer.player, BINGO_STREAMER_BONUS, 'Streamer Bingo bonus', { gameId: SHARED_BINGO_GAME_ID, channel });
  return { won: true, winningLine };
}

export function claimSharedBingoSquare(state: any, input: { channel: unknown; coordinate: unknown; userId?: unknown; username?: unknown; displayName?: unknown; now?: number }) {
  const parsed = parseBingoCoordinate(input.coordinate);
  if (!parsed) return { changed: false, outcome: 'invalid' as const };
  const now = Number(input.now ?? Date.now());
  const channel = normalizeGameHubChannel(input.channel);
  const settled = settleExpiredBingoClaims(state, channel, now);
  const game = getSharedBingoState(state, channel, now);
  const square = game.squares[parsed.index];
  if (game.completedAt) return { changed: settled.changed, outcome: 'complete' as const, blocked: settled.blocked };
  if (square.status !== 'pending' || !square.claimUntil || Date.parse(square.claimUntil) <= now) {
    return { changed: settled.changed, outcome: square.status === 'stella' ? 'blocked' as const : 'not-triggered' as const, blocked: settled.blocked };
  }
  const joined = joinGameHubGame(state, { ...input, gameId: SHARED_BINGO_GAME_ID });
  const wasReplacement = Boolean(square.suggestedBy);
  square.status = 'chat';
  square.claimedBy = joined.player.id;
  delete square.claimUntil;
  const points = wasReplacement ? BINGO_RECLAIM_POINTS : BINGO_CLAIM_POINTS;
  joined.membership.score += points;
  joined.membership.lastActiveAt = new Date(now).toISOString();
  participant(game, joined.player).actions += 1;
  awardGameHubPoints(state, joined.player, points, wasReplacement ? 'Bingo square reclaimed' : 'Bingo phrase claimed', { gameId: SHARED_BINGO_GAME_ID, channel });
  const completion = completeBingoIfWon(state, game, joined, channel, now);
  game.updatedAt = new Date(now).toISOString();
  return { changed: true, outcome: 'claimed' as const, coordinate: parsed.coordinate, points, ...completion, blocked: settled.blocked };
}

const DISALLOWED_PHRASE = /\b(?:fuck|shit|bitch|cunt|nigg|fagg|rape|porn|sex)\w*\b/i;

export function suggestSharedBingoPhrase(state: any, input: { channel: unknown; coordinate: unknown; phrase: unknown; userId?: unknown; username?: unknown; displayName?: unknown; now?: number }) {
  const parsed = parseBingoCoordinate(input.coordinate);
  if (!parsed) return { changed: false, outcome: 'invalid' as const };
  const phrase = String(input.phrase || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (phrase.length < 2 || DISALLOWED_PHRASE.test(phrase)) return { changed: false, outcome: 'inappropriate' as const };
  const now = Number(input.now ?? Date.now());
  const channel = normalizeGameHubChannel(input.channel);
  const settled = settleExpiredBingoClaims(state, channel, now);
  const game = getSharedBingoState(state, channel, now);
  const square = game.squares[parsed.index];
  if (square.status !== 'stella' && square.status !== 'open' && square.status !== 'replacement') return { changed: settled.changed, outcome: 'unavailable' as const, blocked: settled.blocked };
  const joined = joinGameHubGame(state, { ...input, gameId: SHARED_BINGO_GAME_ID });
  if (joined.player.gamePointsBalance < BINGO_PHRASE_CHANGE_COST) return { changed: settled.changed, outcome: 'insufficient' as const, balance: joined.player.gamePointsBalance, cost: BINGO_PHRASE_CHANGE_COST, blocked: settled.blocked };
  spendGameHubPoints(state, joined.player, BINGO_PHRASE_CHANGE_COST, 'Bingo phrase change');
  square.originalPhrase ||= square.phrase;
  square.phrase = phrase;
  square.status = 'replacement';
  square.suggestedBy = joined.player.id;
  delete square.triggeredAt;
  delete square.claimUntil;
  joined.membership.lastActiveAt = new Date(now).toISOString();
  participant(game, joined.player).actions += 1;
  game.updatedAt = new Date(now).toISOString();
  return { changed: true, outcome: 'suggested' as const, coordinate: parsed.coordinate, phrase, cost: BINGO_PHRASE_CHANGE_COST, blocked: settled.blocked };
}

export function buyBingoStellaFlip(state: any, input: { channel: unknown; coordinate: unknown; userId?: unknown; username?: unknown; displayName?: unknown; now?: number }) {
  const parsed = parseBingoCoordinate(input.coordinate);
  if (!parsed) return { changed: false, outcome: 'invalid' as const };
  const now = Number(input.now ?? Date.now()); const channel = normalizeGameHubChannel(input.channel);
  const settled = settleExpiredBingoClaims(state, channel, now); const game = getSharedBingoState(state, channel, now); const square = game.squares[parsed.index];
  if (game.completedAt) return { changed: settled.changed, outcome: 'complete' as const };
  if (square.status !== 'stella') return { changed: settled.changed, outcome: 'unavailable' as const };
  const joined = joinGameHubGame(state, { ...input, gameId: SHARED_BINGO_GAME_ID });
  if (joined.player.gamePointsBalance < BINGO_STELLA_FLIP_COST) return { changed: settled.changed, outcome: 'insufficient' as const, balance: joined.player.gamePointsBalance, cost: BINGO_STELLA_FLIP_COST };
  spendGameHubPoints(state, joined.player, BINGO_STELLA_FLIP_COST, 'Flip Stella Bingo square');
  square.status = 'chat'; square.claimedBy = joined.player.id; participant(game, joined.player).actions += 1;
  const completion = completeBingoIfWon(state, game, joined, channel, now); game.updatedAt = new Date(now).toISOString();
  return { changed: true, outcome: 'flipped' as const, coordinate: parsed.coordinate, cost: BINGO_STELLA_FLIP_COST, ...completion };
}

export function buyBingoCenterFree(state: any, input: { channel: unknown; userId?: unknown; username?: unknown; displayName?: unknown; now?: number }) {
  const now = Number(input.now ?? Date.now()); const channel = normalizeGameHubChannel(input.channel);
  const settled = settleExpiredBingoClaims(state, channel, now); const game = getSharedBingoState(state, channel, now); const square = game.squares[12];
  if (game.completedAt) return { changed: settled.changed, outcome: 'complete' as const };
  if (square.status === 'chat') return { changed: settled.changed, outcome: 'unavailable' as const };
  const joined = joinGameHubGame(state, { ...input, gameId: SHARED_BINGO_GAME_ID });
  if (joined.player.gamePointsBalance < BINGO_CENTER_FREE_COST) return { changed: settled.changed, outcome: 'insufficient' as const, balance: joined.player.gamePointsBalance, cost: BINGO_CENTER_FREE_COST };
  spendGameHubPoints(state, joined.player, BINGO_CENTER_FREE_COST, 'Buy shared Bingo center free space');
  square.status = 'chat'; square.claimedBy = joined.player.id; delete square.claimUntil; participant(game, joined.player).actions += 1;
  const completion = completeBingoIfWon(state, game, joined, channel, now); game.updatedAt = new Date(now).toISOString();
  return { changed: true, outcome: 'freed' as const, coordinate: square.coordinate, cost: BINGO_CENTER_FREE_COST, ...completion };
}

export function sharedBingoPublicSnapshot(state: any, channelValue: unknown, options: { includePhrases?: boolean; now?: number } = {}) {
  const now = Number(options.now ?? Date.now());
  const game = getSharedBingoState(state, channelValue, now);
  const store = getGameHubStore(state);
  const leaderboard = Object.values(store.players)
    .filter((player) => player.joinedGames?.[SHARED_BINGO_GAME_ID])
    .map((player) => ({ username: player.displayName || player.username, score: player.joinedGames[SHARED_BINGO_GAME_ID].score, wins: player.joinedGames[SHARED_BINGO_GAME_ID].wins }))
    .sort((left, right) => right.score - left.score || right.wins - left.wins)
    .slice(0, 10);
  return {
    boardId: game.boardId,
    cells: game.squares.map((square) => ({
      coordinate: square.coordinate,
      status: square.status,
      phrase: options.includePhrases ? square.phrase : undefined,
      claimSeconds: square.status === 'pending' && square.claimUntil ? Math.max(0, Math.ceil((Date.parse(square.claimUntil) - now) / 1000)) : 0,
    })),
    chatSquares: game.squares.filter((square) => square.status === 'chat').length,
    stellaSquares: game.squares.filter((square) => square.status === 'stella').length,
    participantCount: Object.keys(game.participants).length,
    complete: Boolean(game.completedAt),
    winningLine: game.winningLine || [],
    leaderboard,
    updatedAt: game.updatedAt,
  };
}
