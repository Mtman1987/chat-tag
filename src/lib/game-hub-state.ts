import { wordChainResultMessages, type WordChainResultMessage } from '@/lib/word-chain-results';
import type { JsonObject } from '@/lib/volume-store';
import { GAME_HUB_CATALOG, getGameHubGame, normalizeGameHubGameIds } from '@/lib/game-hub-registry';
import { getScoringSettings, scoreFromTagCounts } from '@/lib/scoring';

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
  'A picture is worth a thousand words',
  'Better late than never',
  'Every cloud has a silver lining',
  'Practice makes perfect',
  'The early bird catches the worm',
  'Two heads are better than one',
  'When in doubt dance it out',
  'Adventure is waiting around the corner',
  'Shoot for the moon and land among the stars',
  'Great things begin with small steps',
  'There is no place like home',
  'Keep your eyes on the prize',
] as const;
export const WORD_CHAIN_ROUND_MS = 6 * 60_000;
export const WORD_CHAIN_REVIEW_MS = 60_000;
export const WORD_CHAIN_TALLY_MS = 30_000;
export const WORD_CHAIN_CYCLE_MS = WORD_CHAIN_ROUND_MS + WORD_CHAIN_REVIEW_MS + WORD_CHAIN_TALLY_MS;
export const WORD_CHAIN_THEMES = {
  Animals: ['TIGER', 'ELEPHANT', 'MONKEY', 'ZEBRA', 'ANTELOPE', 'EAGLE', 'EMU', 'OTTER', 'RABBIT', 'TURTLE', 'ELK', 'KANGAROO', 'OWL', 'LEMUR', 'RHINO', 'OCTOPUS', 'SNAKE', 'ECHIDNA', 'ALLIGATOR', 'RACCOON', 'NEWT', 'TOUCAN'],
  Food: ['PIZZA', 'BURGER', 'SALAD', 'TACO', 'ORANGE', 'EGG', 'GRAPE', 'ENCHILADA', 'APPLE', 'EDAMAME', 'ECLAIR', 'RICE', 'EMPANADA', 'AVOCADO', 'OLIVE', 'NOODLE', 'LASAGNA', 'ASPARAGUS', 'SOUP', 'POTATO'],
  Gaming: ['MARIO', 'ZELDA', 'SONIC', 'PACMAN', 'ARCADE', 'ESPORT', 'TETRIS', 'SIMULATOR', 'RACING', 'GAME', 'EMOTE', 'ENGINE', 'NPC', 'COMBO', 'ONLINE', 'ENEMY', 'YOSHI', 'ITEM', 'MULTIPLAYER', 'RESPAWN'],
  Nature: ['TREE', 'OCEAN', 'MOUNTAIN', 'RIVER', 'RAINFOREST', 'TORNADO', 'ORCHID', 'DESERT', 'THUNDER', 'REEF', 'FLOWER', 'ROCK', 'KOI', 'ISLAND', 'DAISY', 'YARROW', 'WILLOW', 'WATERFALL', 'LAKE', 'EARTH'],
  Space: ['ROCKET', 'TELESCOPE', 'EARTH', 'HUBBLE', 'ECLIPSE', 'EXOPLANET', 'TITAN', 'NEBULA', 'ASTEROID', 'DUST', 'COSMOS', 'PLANET', 'TRITON', 'NOVA', 'AURORA', 'ASTRONAUT', 'TEKTITE', 'EUROPA', 'APOLLO', 'ORBIT'],
  Music: ['RHYTHM', 'MELODY', 'YODEL', 'LYRIC', 'CHORUS', 'SONG', 'GUITAR', 'RECORD', 'DRUM', 'MUSIC', 'CONCERT', 'TUNE', 'ENCORE', 'ECHO', 'OCTAVE', 'ENSEMBLE', 'EARPHONE', 'EQUALIZER', 'REMIX', 'XYLOPHONE'],
  Movies: ['CINEMA', 'ACTOR', 'REEL', 'LIGHTS', 'SCENE', 'EDIT', 'TRAILER', 'ROLE', 'EXTRA', 'AWARD', 'DIRECTOR', 'ROMANCE', 'EPIC', 'CAMERA', 'ANIMATION', 'NOIR', 'REMAKE', 'ENDING', 'GENRE', 'EFFECTS'],
  Travel: ['PASSPORT', 'TRAIN', 'NAVIGATE', 'EXPLORE', 'EUROPE', 'EXCURSION', 'NOMAD', 'DESTINATION', 'NIGHTLIFE', 'ESCAPE', 'EXPEDITION', 'DRIVE', 'EMBARK', 'KAYAK', 'LANDMARK', 'TOUR', 'RESORT', 'TRAIL', 'LUGGAGE', 'ADVENTURE'],
  Sports: ['TENNIS', 'SOCCER', 'RUGBY', 'BASEBALL', 'HOCKEY', 'GOLF', 'SWIMMING', 'CRICKET'],
  Jobs: ['TEACHER', 'NURSE', 'PILOT', 'CHEF', 'ENGINEER', 'ARTIST', 'FARMER', 'DENTIST'],
  Clothing: ['SHIRT', 'TROUSERS', 'SCARF', 'JACKET', 'SWEATER', 'DRESS', 'BOOTS', 'GLOVES'],
  Transport: ['BICYCLE', 'TRAIN', 'TRUCK', 'SCOOTER', 'BOAT', 'AIRPLANE', 'TRAM', 'SUBMARINE'],
  'Around the House': ['SOFA', 'TABLE', 'LAMP', 'WINDOW', 'DOOR', 'CARPET', 'SHELF', 'MIRROR'],
  'Myths and Magic': ['DRAGON', 'WIZARD', 'UNICORN', 'PHOENIX', 'MERMAID', 'TROLL', 'FAIRY', 'GRIFFIN'],
  'Arts and Crafts': ['PAINT', 'BRUSH', 'CANVAS', 'PENCIL', 'SCULPTURE', 'POTTERY', 'ORIGAMI', 'YARN'],
  'At the Beach': ['SAND', 'SHELL', 'WAVE', 'SURFBOARD', 'TOWEL', 'UMBRELLA', 'SEAGULL', 'SUNSCREEN'],
  Technology: ['COMPUTER', 'KEYBOARD', 'MONITOR', 'ROUTER', 'SOFTWARE', 'ROBOT', 'SENSOR', 'CAMERA'],
  Gardening: ['SEED', 'SOIL', 'COMPOST', 'TROWEL', 'FLOWER', 'ROOT', 'LEAF', 'WATERING'],
  'Winter Fun': ['SNOWMAN', 'SLED', 'SKIING', 'SKATING', 'MITTENS', 'FIREPLACE', 'SNOWBALL', 'COCOA'],
  'School Days': ['PENCIL', 'NOTEBOOK', 'CLASSROOM', 'TEACHER', 'RECESS', 'BACKPACK', 'LIBRARY', 'HOMEWORK'],
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
  gameRunIds?: Record<string, string>;
  gameStartedAt?: Record<string, string>;
  wordGuessChoices?: Record<string, { runId: string; choice: 'guess' | 'command' }>;
  playerGameFocus?: Record<string, { gameId: string; runId: string; lastUsedAt: string }>;
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
  wordChainThemeInventory?: Array<{
    id: string;
    name: string;
    normalized: string;
    words: string[];
    submitterPlayerId: string;
    submitterDisplayName: string;
    submittedAt: string;
  }>;
  wordChainThemeQueue?: string[];
  wordChainThemeHistory?: string[];
  pendingWordChainResults?: WordChainResultMessage[];
  wordChainRound?: {
    roundSlot: number;
    theme: string;
    themeWords?: string[];
    currentWord: string;
    usedWords: string[];
    lastContributorPlayerId?: string;
    comboMultiplier: number;
    settled?: boolean;
    entries?: Array<{
      word: string; playerId: string; displayName: string; sourceChannel: string;
      points: number; votes: Record<string, boolean>;
    }>;
  };
  lastWordChainTally?: {
    roundSlot: number; theme: string; accepted: number; rejected: number;
    words: Array<{ word: string; up: number; down: number; accepted: boolean; points: number }>;
    leaders: Array<{ displayName: string; points: number }>;
  };
  wordChainGame?: {
    gameSlot: number;
    roundsSettled: number;
    scores: Record<string, { displayName: string; points: number }>;
  };
  wordChainVerdicts?: Record<string, boolean>;
  chatWarsBattle?: { battleId: string; channels: string[]; createdBy: string; createdAt: string; active: boolean };
  streamGameBattles?: Record<string, {
    battleId: string;
    gameId: 'wordchain' | 'phraseguess';
    channels: string[];
    createdBy: string;
    createdAt: string;
    active: boolean;
    scores: Record<string, number>;
    winnerChannel?: string;
    winnerDisplayName?: string;
  }>;
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

export const GAME_FOCUS_TTL_MS = 30 * 60_000;

export function rememberGameHubPlayerFocus(
  state: any,
  channelValue: unknown,
  playerIdValue: unknown,
  gameIdValue: unknown,
  nowValue = Date.now(),
) {
  const channel = normalizeGameHubChannel(channelValue);
  const playerId = String(playerIdValue || '').trim();
  const game = getGameHubGame(String(gameIdValue || '').trim().toLowerCase());
  if (!channel || !playerId || !game) return null;
  const settings = getChannelGameSettings(state, channel);
  const runId = settings.gameRunIds?.[game.id] || 'initial';
  const now = Math.max(0, Math.floor(Number(nowValue || Date.now())));
  settings.playerGameFocus ||= {};
  settings.playerGameFocus[playerId] = {
    gameId: game.id,
    runId,
    lastUsedAt: new Date(now).toISOString(),
  };
  settings.playerGameFocus = Object.fromEntries(Object.entries(settings.playerGameFocus).slice(-500));
  return settings.playerGameFocus[playerId];
}

export function resolveGameHubPlayerFocus(
  state: any,
  channelValue: unknown,
  playerIdValue: unknown,
  candidateGameIdsValue: unknown[],
  nowValue = Date.now(),
) {
  const channel = normalizeGameHubChannel(channelValue);
  const playerId = String(playerIdValue || '').trim();
  if (!channel || !playerId) return null;
  const settings = getChannelGameSettings(state, channel);
  const focus = settings.playerGameFocus?.[playerId];
  if (!focus) return null;
  const candidates = new Set(normalizeGameHubGameIds(candidateGameIdsValue, 50));
  if (!candidates.has(focus.gameId)) return null;
  const currentRunId = settings.gameRunIds?.[focus.gameId] || 'initial';
  if (focus.runId !== currentRunId) return null;
  const lastUsedAt = Date.parse(focus.lastUsedAt);
  const now = Math.max(0, Math.floor(Number(nowValue || Date.now())));
  if (!Number.isFinite(lastUsedAt) || now - lastUsedAt > GAME_FOCUS_TTL_MS) return null;
  return focus.gameId;
}

export function setChannelGameRunning(state: any, channelValue: unknown, gameIdValue: unknown, running: boolean) {
  const channel = normalizeGameHubChannel(channelValue);
  const game = getGameHubGame(String(gameIdValue || ''));
  if (!channel || !game) throw new Error('Valid channel and game are required.');
  const settings = getChannelGameSettings(state, channel);
  const extras = new Set(settings.extraGameIds);
  const stopped = new Set(settings.stoppedGameIds);
  const wasConfigured = extras.has(game.id);
  extras.add(game.id);
  if (running) {
    settings.gameStartedAt ||= {};
    if (stopped.has(game.id) || !settings.gameStartedAt[game.id]) settings.gameStartedAt[game.id] = new Date().toISOString();
    if (stopped.has(game.id) || !wasConfigured) {
      settings.gameRunIds ||= {};
      const stamp = new Date().toISOString();
      const previousRunId = String(settings.gameRunIds[game.id] || '');
      const [previousStamp, previousSequenceText] = previousRunId.split('#');
      const sequence = previousStamp === stamp ? Math.max(2, Number(previousSequenceText || 1) + 1) : 1;
      settings.gameRunIds[game.id] = sequence === 1 ? stamp : `${stamp}#${sequence}`;
    }
    stopped.delete(game.id);
  } else {
    stopped.add(game.id);
    // Stop the engine as well as its presentation. Keep earned scores/artwork.
    const runtime = settings as any;
    if (game.id === 'dancingparade') {
      const parade = state.gameSettings?.default?.dancingParade?.channels?.[channel];
      if (parade) parade.active = null;
    }
    if (game.id === 'treasurehunt' && runtime.treasureHunt) {
      runtime.treasureHunt.rotation = [];
      runtime.treasureHunt.kickVotes = [];
      delete runtime.treasureHunt.turnExpiresAt;
      delete runtime.treasureHunt.activeChallenge;
    }
    if (game.id === 'bingo' && runtime.sharedBingo) {
      for (const square of runtime.sharedBingo.squares || []) {
        if (square.status === 'pending') { square.status = 'open'; delete square.claimUntil; }
      }
    }
    if (game.id === 'pixelbattle' && runtime.mosaic?.current?.status === 'active') {
      runtime.mosaic.current.status = 'suspended';
      runtime.mosaic.saves = [runtime.mosaic.current, ...(runtime.mosaic.saves || []).filter((item: any) => item.id !== runtime.mosaic.current.id)].slice(0, 20);
    }
    for (const [playerId, focus] of Object.entries(settings.playerGameFocus || {})) {
      if (focus.gameId === game.id) delete settings.playerGameFocus![playerId];
    }
    const instruction = state.gameSettings?.default?.gameHubInstructions?.[channel];
    if (instruction?.gameId === game.id) instruction.visible = false;
  }
  settings.extraGameIds = normalizeGameHubGameIds([...extras], 50);
  settings.stoppedGameIds = normalizeGameHubGameIds([...stopped], 50);
  settings.updatedAt = new Date().toISOString();
  return settings;
}

export const GAME_INACTIVITY_MS = 30 * 60_000;

export function stopInactiveChannelGames(state: any, channelValue: unknown, now = Date.now()) {
  const channel = normalizeGameHubChannel(channelValue);
  const settings = getChannelGameSettings(state, channel);
  const stopped: string[] = [];
  for (const id of resolveChannelGameIds(state, channel)) {
    if (id === 'chat-tag') continue;
    settings.gameStartedAt ||= {};
    // Give legacy active runs a defined baseline, rather than treating reads as play.
    settings.gameStartedAt[id] ||= settings.gameRunIds?.[id]?.split('#')[0] || new Date(now).toISOString();
    let last = Date.parse(settings.gameStartedAt[id]);
    const actions = state.gameSettings?.default?.gameHubRuntime?.channels?.[channel]?.games?.[id]?.actions || [];
    for (const action of actions) {
      if (action.action !== 'stop') last = Math.max(last, Date.parse(action.at) || 0);
    }
    for (const focus of Object.values(settings.playerGameFocus || {})) {
      if (focus.gameId === id) last = Math.max(last, Date.parse(focus.lastUsedAt) || 0);
    }
    if (id === 'pixelbattle') last = Math.max(last, Date.parse((settings as any).mosaic?.current?.lastInteractionAt || '') || 0);
    if (now - last < GAME_INACTIVITY_MS) continue;
    setChannelGameRunning(state, channel, id, false);
    stopped.push(id);
  }
  return stopped;
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
  const stateChannel = streamGameStateChannel(state, channel, 'phraseguess');
  const now = Math.max(0, Math.floor(Number(input.now ?? Date.now())));
  const settings = getChannelGameSettings(state, stateChannel);
  const activeRound = phraseGuessRoundForChannel(state, stateChannel, now);
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
  input: { channel: unknown; userId?: unknown; username?: unknown; displayName?: unknown; message?: unknown; now?: number; explicit?: boolean },
) {
  const channel = normalizeGameHubChannel(input.channel);
  const message = String(input.message || '').trim();
  if (!channel || !message || (!input.explicit && /^!?@?spmt(?:\s|$)/i.test(message))) return { changed: false, outcome: 'ignored' as const };

  const player = getOrCreateGameHubPlayer(state, input);
  const membership = player.joinedGames.phraseguess;
  if (!membership?.active) return { changed: false, outcome: 'not-playing' as const };

  const stateChannel = streamGameStateChannel(state, channel, 'phraseguess');
  const now = Math.max(0, Math.floor(Number(input.now ?? Date.now())));
  const settings = getChannelGameSettings(state, stateChannel);
  const current = phraseGuessRoundForChannel(state, stateChannel, now);
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
    updateStreamGameBattle(state, channel, 'phraseguess', (battle) => {
      battle.scores[channel] = Number(battle.scores[channel] || 0) + 1;
      battle.winnerChannel = channel;
      battle.winnerDisplayName = player.displayName;
    });
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
  const roundSlot = Math.floor(now / WORD_CHAIN_CYCLE_MS);
  const themeNames = Object.keys(WORD_CHAIN_THEMES) as Array<keyof typeof WORD_CHAIN_THEMES>;
  const theme = themeNames[roundSlot % themeNames.length];
  const words = WORD_CHAIN_THEMES[theme];
  const seedIndex = Math.floor(roundSlot / themeNames.length) % words.length;
  return { roundSlot, theme, seed: words[seedIndex] };
}

function wordChainThemeCatalog(settings: GameHubChannelSettings) {
  const builtIn = Object.entries(WORD_CHAIN_THEMES).map(([name, words]) => ({ name, words: [...words] }));
  const community = (settings.wordChainThemeInventory || []).map((entry) => ({ name: entry.name, words: entry.words }));
  return [...builtIn, ...community];
}

export function submitWordChainTheme(
  state: any,
  input: { channel: unknown; userId?: unknown; username?: unknown; displayName?: unknown; name: unknown; words: unknown; now?: number },
) {
  const channel = normalizeGameHubChannel(input.channel);
  if (!channel) throw new Error('A channel is required.');
  const name = String(input.name || '').replace(/[^a-z0-9 '&-]/gi, '').replace(/\s+/g, ' ').trim().slice(0, 30);
  const normalized = name.toLowerCase();
  const words = [...new Set(String(input.words || '').split(/[\s,]+/).map(normalizedWordChainMessage)
    .filter((word) => /^[A-Z]{3,20}$/.test(word)))].slice(0, 40);
  if (name.length < 2) throw new Error('Give the theme a short name.');
  if (String(input.words || '').trim() && words.length < 4) throw new Error('Add at least four starter words separated by commas, or use just the theme name.');
  const settings = getChannelGameSettings(state, streamGameStateChannel(state, channel, 'wordchain'));
  settings.wordChainThemeInventory ||= [];
  const existing = wordChainThemeCatalog(settings).find((entry) => entry.name.toLowerCase() === normalized);
  if (existing && words.length) throw new Error('That Word Chain theme already exists. Request it using just its name.');
  const queueTheme = () => {
    settings.wordChainThemeQueue ||= [];
    if (!settings.wordChainThemeQueue.includes(normalized)) settings.wordChainThemeQueue.push(normalized);
    return settings.wordChainThemeQueue.indexOf(normalized) + 1;
  };
  if (existing) return { entry: existing, inventorySize: settings.wordChainThemeInventory.length, queuePosition: queueTheme() };
  const player = getOrCreateGameHubPlayer(state, input);
  const now = Math.max(0, Math.floor(Number(input.now ?? Date.now())));
  const submittedAt = new Date(now).toISOString();
  const entry = {
    id: `theme:${player.id}:${now}`,
    name,
    normalized,
    words,
    submitterPlayerId: player.id,
    submitterDisplayName: player.displayName,
    submittedAt,
  };
  settings.wordChainThemeInventory = [...settings.wordChainThemeInventory, entry].slice(-50);
  settings.updatedAt = submittedAt;
  return { entry, inventorySize: settings.wordChainThemeInventory.length, queuePosition: queueTheme() };
}

function normalizedWordChainMessage(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function settleWordChainRound(state: any, channel: string, settings: GameHubChannelSettings, now: number) {
  const previous = settings.wordChainRound;
  if (!previous || previous.settled) return false;
  previous.settled = true;
  const gameSlot = Math.floor(previous.roundSlot / 5);
  if (settings.wordChainGame?.gameSlot !== gameSlot) {
    settings.wordChainGame = { gameSlot, roundsSettled: 0, scores: {} };
  }
  const game = settings.wordChainGame!;
  const totals = new Map<string, { displayName: string; points: number }>();
  let accepted = 0;
  let rejected = 0;
  const words = (previous.entries || []).map((entry) => {
    const votes = Object.values(entry.votes || {});
    const up = votes.filter(Boolean).length;
    const down = votes.length - up;
    const valid = down <= up;
    const bonus = valid ? Math.min(20, Math.max(0, up - down) * 2) : 0;
    const points = valid ? entry.points + bonus : 0;
    settings.wordChainVerdicts ||= {};
    settings.wordChainVerdicts[`${previous.theme}:${entry.word}`] = valid;
    const player = getGameHubStore(state).players[entry.playerId];
    if (player) {
      const member = player.joinedGames.wordchain;
      if (!valid && member) member.score = Math.max(0, member.score - entry.points);
      if (valid) {
        if (member) member.score += bonus;
        awardGameHubPoints(state, player, points, 'Word Chain round tally', { gameId: 'wordchain', channel: entry.sourceChannel });
        updateStreamGameBattle(state, entry.sourceChannel, 'wordchain', (battle) => {
          battle.scores[entry.sourceChannel] = Number(battle.scores[entry.sourceChannel] || 0) + points;
        });
      }
    }
    const tally = totals.get(entry.playerId) || { displayName: entry.displayName, points: 0 };
    tally.points += points;
    totals.set(entry.playerId, tally);
    const gameScore = game.scores[entry.playerId] || { displayName: entry.displayName, points: 0 };
    gameScore.displayName = entry.displayName;
    gameScore.points += points;
    game.scores[entry.playerId] = gameScore;
    if (valid) accepted++; else rejected++;
    return { word: entry.word, up, down, accepted: valid, points };
  });
  game.roundsSettled = Math.min(5, game.roundsSettled + 1);
  settings.wordChainVerdicts = Object.fromEntries(Object.entries(settings.wordChainVerdicts || {}).slice(-500));
  settings.lastWordChainTally = {
    roundSlot: previous.roundSlot, theme: previous.theme, accepted, rejected, words,
    leaders: [...totals.values()].sort((left, right) => right.points - left.points || left.displayName.localeCompare(right.displayName)),
  };
  // Persist results with the tally, so tenants need neither Stella nor an open overlay.
  // Do not replay an old game's results when an inactive channel returns later.
  if ((totals.size || (previous.roundSlot % 5 === 4 && Object.keys(game.scores).length)) && now < (previous.roundSlot + 2) * WORD_CHAIN_CYCLE_MS) {
    const channels = getStreamGameBattle(state, channel, 'wordchain')?.channels || [channel];
    settings.pendingWordChainResults = [...(settings.pendingWordChainResults || []), ...channels.flatMap(target =>
      wordChainResultMessages({ channel: target, roundSlot: previous.roundSlot, theme: previous.theme,
        roundParticipants: settings.lastWordChainTally!.leaders, gameParticipants: Object.values(game.scores),
        gameEnded: previous.roundSlot % 5 === 4, expiresAt: (previous.roundSlot + 2) * WORD_CHAIN_CYCLE_MS }))].slice(-200);
  }
  return true;
}

export function advanceWordChainRound(state: any, channelValue: unknown, nowValue = Date.now()) {
  const channel = normalizeGameHubChannel(channelValue);
  const settings = getChannelGameSettings(state, streamGameStateChannel(state, channel, 'wordchain'));
  const now = Math.max(0, Math.floor(Number(nowValue)));
  const roundSlot = Math.floor(now / WORD_CHAIN_CYCLE_MS);
  if (settings.wordChainRound?.roundSlot === roundSlot) {
    const due = now % WORD_CHAIN_CYCLE_MS >= WORD_CHAIN_ROUND_MS + WORD_CHAIN_REVIEW_MS;
    const changed = due ? settleWordChainRound(state, channel, settings, now) : false;
    return { changed, round: settings.wordChainRound };
  }
  const changed = settleWordChainRound(state, channel, settings, now);
  const gameSlot = Math.floor(roundSlot / 5);
  if (settings.wordChainGame?.gameSlot !== gameSlot) {
    settings.wordChainGame = { gameSlot, roundsSettled: 0, scores: {} };
  }
  const catalog = wordChainThemeCatalog(settings);
  const requested = settings.wordChainThemeQueue?.shift();
  const history = settings.wordChainThemeHistory || (settings.wordChainRound ? [settings.wordChainRound.theme.toLowerCase()] : []);
  const unused = catalog.filter(entry => !history.includes(entry.name.toLowerCase()));
  const pool = unused.length ? unused : catalog.filter(entry => entry.name !== settings.wordChainRound?.theme);
  const selected = catalog.find(entry => entry.name.toLowerCase() === requested)
    || pool[roundSlot % pool.length] || catalog[0];
  settings.wordChainThemeHistory = [...new Set([...(unused.length ? history : []), selected.name.toLowerCase()])].slice(-catalog.length);
  const seed = selected.words[Math.floor(roundSlot / catalog.length) % selected.words.length] || '';
  settings.wordChainRound = {
    roundSlot, theme: selected.name, themeWords: selected.words,
    currentWord: seed, usedWords: seed ? [seed] : [], comboMultiplier: 1, entries: [],
  };
  return { changed: true, round: settings.wordChainRound, settled: changed ? settings.lastWordChainTally : null };
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
    ? Math.min(round.comboMultiplier + 0.5, 3) : 1;
  const points = Math.floor(word.length * combo);
  round.currentWord = word;
  round.usedWords = [...round.usedWords, word].slice(-100);
  round.lastContributorPlayerId = player.id;
  round.comboMultiplier = combo;
  round.entries ||= [];
  round.entries.push({
    word, playerId: player.id, displayName: player.displayName,
    sourceChannel: channel, points, votes: {},
  });
  membership.score += points; // provisional until the end-of-round vote settles
  membership.lastActiveAt = new Date(now).toISOString();
  return { points, combo, position: round.entries.length };
}

export function recordWordChainVote(
  state: any,
  input: { channel: unknown; userId?: unknown; username?: unknown; word: unknown; up: boolean; now?: number },
) {
  const channel = normalizeGameHubChannel(input.channel);
  const now = Math.max(0, Math.floor(Number(input.now ?? Date.now())));
  const advanced = advanceWordChainRound(state, channel, now);
  const round = advanced.round;
  const elapsed = now % WORD_CHAIN_CYCLE_MS;
  if (elapsed < WORD_CHAIN_ROUND_MS) return { changed: advanced.changed, outcome: 'not-review' as const };
  if (elapsed >= WORD_CHAIN_ROUND_MS + WORD_CHAIN_REVIEW_MS) return { changed: advanced.changed, outcome: 'vote-closed' as const };
  const selector = String(input.word || '').trim().replace(/^#(?=\d+$)/, '').toUpperCase();
  const entry = /^\d+$/.test(selector) ? round.entries?.[Number(selector) - 1]
    : round.entries?.find((candidate) => candidate.word === selector);
  if (!entry) return { changed: advanced.changed, outcome: 'unknown-word' as const };
  const voterId = normalizeGameHubPlayerId(input.userId, input.username);
  if (!voterId) return { changed: advanced.changed, outcome: 'invalid-voter' as const };
  entry.votes ||= {};
  if (entry.votes[voterId] === Boolean(input.up)) return { changed: advanced.changed, outcome: 'unchanged' as const, word: entry.word };
  entry.votes[voterId] = Boolean(input.up);
  return { changed: true, outcome: 'voted' as const, word: entry.word };
}

export function recordWordChainMessage(
  state: any,
  input: { channel: unknown; userId?: unknown; username?: unknown; displayName?: unknown; message?: unknown; now?: number; explicit?: boolean },
) {
  const channel = normalizeGameHubChannel(input.channel);
  const message = String(input.message || '').trim();
  if (!channel || !message || (!input.explicit && /^!?@?spmt(?:\s|$)/i.test(message))) return { changed: false, outcome: 'ignored' as const };
  const now = Math.max(0, Math.floor(Number(input.now ?? Date.now())));
  const advanced = advanceWordChainRound(state, channel, now);
  const round = advanced.round;
  if (now % WORD_CHAIN_CYCLE_MS >= WORD_CHAIN_ROUND_MS) return { changed: advanced.changed, outcome: 'review' as const };
  const player = getOrCreateGameHubPlayer(state, input);
  if (!player.joinedGames.wordchain?.active) return { changed: advanced.changed, outcome: 'not-playing' as const };
  const normalized = normalizedWordChainMessage(message);
  if (!/^[A-Z]+$/.test(normalized) || normalized.length < 3) return { changed: advanced.changed, outcome: 'invalid' as const };
  if (round.currentWord && normalized[0] !== round.currentWord.at(-1)) return { changed: advanced.changed, outcome: 'wrong-letter' as const };
  if (round.usedWords.includes(normalized)) return { changed: advanced.changed, outcome: 'used' as const };
  const settings = getChannelGameSettings(state, streamGameStateChannel(state, channel, 'wordchain'));
  if (settings.wordChainVerdicts?.[`${round.theme}:${normalized}`] === false) {
    return { changed: advanced.changed, outcome: 'rejected' as const };
  }
  const applied = applyWordChainWord(state, channel, round, player, normalized, now);
  return { changed: true, outcome: 'accepted' as const, ...applied };
}

function stablePhraseMask(phrase: string, roundSlot: number, revealPercent: number) {
  const characters = [...phrase];
  const letterIndexes = characters.map((character, index) => /[a-z0-9]/i.test(character) ? index : -1).filter((index) => index >= 0);
  const ranked = [...letterIndexes].sort((left, right) => {
    const hash = (index: number) => ((index + 17) * 1103515245 + (roundSlot + 31) * 12345) >>> 0;
    return hash(left) - hash(right);
  });
  const visibleCount = Math.max(1, Math.ceil(letterIndexes.length * Math.max(0, Math.min(100, revealPercent)) / 100));
  const visible = new Set(ranked.slice(0, visibleCount));
  return characters.map((character, index) => /[a-z0-9]/i.test(character) && !visible.has(index) ? '•' : character).join('');
}

export function phraseGuessPublicSnapshot(state: any, channelValue: unknown, nowValue = Date.now()) {
  const channel = normalizeGameHubChannel(channelValue);
  const stateChannel = streamGameStateChannel(state, channel, 'phraseguess');
  const now = Math.max(0, Math.floor(Number(nowValue)));
  const round = phraseGuessRoundForChannel(state, stateChannel, now);
  const elapsed = now - round.roundSlot * PHRASE_GUESS_ROUND_MS;
  const revealSteps = Math.floor(elapsed / 45_000);
  const revealPercent = 10 + revealSteps * 10 + Math.max(0, Number(round.hintsUsed || 0)) * 10;
  const solved = Boolean(round.winnerPlayerId);
  return {
    roundSlot: round.roundSlot,
    maskedPhrase: solved ? (round.phrase || '') : stablePhraseMask(round.phrase || '', round.roundSlot, revealPercent),
    secondsLeft: Math.max(0, Math.ceil((PHRASE_GUESS_ROUND_MS - elapsed) / 1000)),
    hintsUsed: Math.max(0, Number(round.hintsUsed || 0)),
    solved,
    submitterDisplayName: round.submitterDisplayName || '',
    leaderboard: getGameHubGameStats(state, 'phraseguess').leaderboard.slice(0, 5),
  };
}

export function wordChainPublicSnapshot(state: any, channelValue: unknown, nowValue = Date.now()) {
  const channel = normalizeGameHubChannel(channelValue);
  const stateChannel = streamGameStateChannel(state, channel, 'wordchain');
  const now = Math.max(0, Math.floor(Number(nowValue)));
  // Read-only consumers must not settle points on the cached state. The word
  // stage endpoint commits each boundary with updateAppStateIfChanged.
  const settings = getChannelGameSettings(state, stateChannel);
  const expectedSlot = Math.floor(now / WORD_CHAIN_CYCLE_MS);
  const settlementDue = now % WORD_CHAIN_CYCLE_MS >= WORD_CHAIN_ROUND_MS + WORD_CHAIN_REVIEW_MS;
  const displayState = settings.wordChainRound?.roundSlot !== expectedSlot
    || (settlementDue && !settings.wordChainRound?.settled) ? structuredClone(state) : state;
  const round = advanceWordChainRound(displayState, channel, now).round;
  const elapsed = now % WORD_CHAIN_CYCLE_MS;
  const review = elapsed >= WORD_CHAIN_ROUND_MS && !settlementDue;
  const entries = round.entries || [];
  const displaySettings = getChannelGameSettings(displayState, stateChannel);
  const tally = displaySettings.lastWordChainTally;
  const gameParticipants = Object.values(displaySettings.wordChainGame?.scores || {})
    .sort((left, right) => right.points - left.points || left.displayName.localeCompare(right.displayName));
  const topGameScore = gameParticipants[0]?.points;
  const gameWinners = !topGameScore ? [] : gameParticipants.filter((entry) => entry.points === topGameScore);
  const leaders = new Map<string, { displayName: string; points: number }>();
  for (const entry of entries) {
    const current = leaders.get(entry.playerId) || { displayName: entry.displayName, points: 0 };
    current.points += entry.points;
    leaders.set(entry.playerId, current);
  }
  return {
    roundSlot: round.roundSlot,
    roundNumber: round.roundSlot % 5 + 1,
    gameSlot: Math.floor(round.roundSlot / 5),
    theme: round.theme,
    currentWord: round.currentWord,
    requiredLetter: round.currentWord.at(-1) || '',
    chainLength: round.usedWords.length,
    phase: settlementDue ? 'tally' : review ? 'review' : 'play',
    secondsLeft: Math.max(0, Math.ceil(((settlementDue ? WORD_CHAIN_CYCLE_MS : review ? WORD_CHAIN_ROUND_MS + WORD_CHAIN_REVIEW_MS : WORD_CHAIN_ROUND_MS) - elapsed) / 1000)),
    reviewWords: (review || settlementDue) ? entries.map((entry, index) => {
      const votes = Object.values(entry.votes || {});
      const final = settlementDue ? tally?.words[index] : null;
      return { number: index + 1, word: entry.word, displayName: entry.displayName,
        points: final ? final.points : entry.points, accepted: final?.accepted,
        up: votes.filter(Boolean).length, down: votes.filter((vote) => !vote).length };
    }) : [],
    reviewLeaders: settlementDue ? tally?.leaders || []
      : review ? [...leaders.values()].sort((left, right) => right.points - left.points) : [],
    lastTally: tally || null,
    lastPlay: entries.length ? {
      word: entries.at(-1)!.word,
      displayName: entries.at(-1)!.displayName,
      points: entries.at(-1)!.points,
      combo: round.comboMultiplier,
      position: entries.length,
    } : null,
    gameEnded: settlementDue && round.roundSlot % 5 === 4,
    gameParticipants,
    gameWinner: settlementDue && round.roundSlot % 5 === 4 ? gameWinners[0] || null : null,
    gameWinners: settlementDue && round.roundSlot % 5 === 4 ? gameWinners : [],
    leaderboard: getGameHubGameStats(state, 'wordchain').leaderboard.slice(0, 5),
  };
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
  if (game.id === 'chat-tag') {
    // Chat Tag has its own persistent roster and history. The generic game-hub
    // membership starts at zero and is not where tags are scored.
    const counts: Record<string, { tags: number; tagged: number }> = {};
    for (const entry of state.tagHistory || []) {
      if (entry?.blocked) continue;
      const from = entry.taggerId || entry.from;
      const to = entry.taggedId || entry.to;
      if (from && from !== 'system') {
        (counts[from] ||= { tags: 0, tagged: 0 }).tags++;
      }
      if (to && to !== 'system' && to !== 'free-for-all') {
        (counts[to] ||= { tags: 0, tagged: 0 }).tagged++;
      }
    }
    const scoring = getScoringSettings(state);
    const blacklisted = new Set(
      (state.botSettings?.blacklistedChannels?.channels || [])
        .map((channel: string) => normalizeGameHubChannel(channel)),
    );
    const tagPlayers = Object.entries(state.tagPlayers || {})
      .filter(([, player]: [string, any]) => {
        const username = normalizeGameHubChannel(player?.twitchUsername || player?.username);
        return !player?.optedOut && !blacklisted.has(username);
      })
      .map(([key, player]: [string, any]) => {
        const id = String(player.id || key);
        const username = String(player.twitchUsername || player.username || key);
        const hubPlayer = store.players[normalizeGameHubPlayerId(id.replace(/^user_/, ''), username)];
        const tally = counts[id] || { tags: 0, tagged: 0 };
        return {
          id,
          username,
          displayName: username,
          gamePointsBalance: hubPlayer?.gamePointsBalance || 0,
          joinedAt: String(player.joinedAt || ''),
          lastActiveAt: player.lastChatAt ? new Date(player.lastChatAt).toISOString() : '',
          active: true,
          score: scoreFromTagCounts(tally, scoring) + Number(player.bingoPoints || 0),
          wins: Number(player.wins || 0),
          plays: tally.tags + tally.tagged,
        };
      });
    const leaderboard = [...tagPlayers].sort((a, b) =>
      b.score - a.score || b.wins - a.wins || a.username.localeCompare(b.username)
    ).slice(0, 50);
    return { game, leaderboard, players: tagPlayers.slice(0, 100) };
  }
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

export function setStreamGameBattle(
  state: any,
  input: { gameId: 'wordchain' | 'phraseguess'; channels: unknown[]; createdBy?: unknown; active?: boolean },
) {
  const gameId = input.gameId;
  if (gameId !== 'wordchain' && gameId !== 'phraseguess') throw new Error('Unsupported stream battle game.');
  const channels = [...new Set((input.channels || []).map(normalizeGameHubChannel).filter(Boolean))].slice(0, 4);
  if (channels.length < 2) throw new Error('A stream battle requires at least two channels.');
  const createdAt = new Date().toISOString();
  const battle = {
    battleId: `${gameId}:${channels.slice().sort().join('+')}`,
    gameId,
    channels,
    createdBy: normalizeGameHubChannel(input.createdBy) || channels[0],
    createdAt,
    active: input.active !== false,
    scores: Object.fromEntries(channels.map((channel) => [channel, 0])),
  };
  for (const channel of channels) {
    const settings = getChannelGameSettings(state, channel);
    settings.streamGameBattles ||= {};
    settings.streamGameBattles[gameId] = { ...battle, scores: { ...battle.scores } };
    setChannelGameRunning(state, channel, gameId, battle.active);
  }
  return battle;
}

export function getStreamGameBattle(state: any, channelValue: unknown, gameId: 'wordchain' | 'phraseguess') {
  const channel = normalizeGameHubChannel(channelValue);
  return getChannelGameSettings(state, channel).streamGameBattles?.[gameId] || null;
}

function streamGameStateChannel(state: any, channelValue: unknown, gameId: 'wordchain' | 'phraseguess') {
  const channel = normalizeGameHubChannel(channelValue);
  const battle = getStreamGameBattle(state, channel, gameId);
  return battle?.active && battle.channels.includes(channel) ? battle.channels[0] : channel;
}

function updateStreamGameBattle(
  state: any,
  sourceChannelValue: unknown,
  gameId: 'wordchain' | 'phraseguess',
  mutate: (battle: NonNullable<GameHubChannelSettings['streamGameBattles']>[string]) => void,
) {
  const sourceChannel = normalizeGameHubChannel(sourceChannelValue);
  const battle = getStreamGameBattle(state, sourceChannel, gameId);
  if (!battle?.active || !battle.channels.includes(sourceChannel)) return null;
  const next = { ...battle, scores: { ...battle.scores } };
  mutate(next);
  for (const channel of next.channels) {
    const settings = getChannelGameSettings(state, channel);
    settings.streamGameBattles ||= {};
    settings.streamGameBattles[gameId] = { ...next, scores: { ...next.scores } };
  }
  return next;
}

export function streamGameBattlePublicSnapshot(state: any, channelValue: unknown, gameId: 'wordchain' | 'phraseguess') {
  const battle = getStreamGameBattle(state, channelValue, gameId);
  if (!battle?.active) return null;
  return {
    battleId: battle.battleId,
    gameId: battle.gameId,
    channels: battle.channels,
    scores: battle.scores,
    createdBy: battle.createdBy,
    createdAt: battle.createdAt,
    active: battle.active,
    winnerChannel: battle.winnerChannel || '',
    winnerDisplayName: battle.winnerDisplayName || '',
  };
}

export function setChatWarsBattle(state:any,input:{channels:unknown[];createdBy?:unknown;active?:boolean}){
 const channels=[...new Set((input.channels||[]).map(normalizeGameHubChannel).filter(Boolean))].slice(0,4);
 if(channels.length<2) throw new Error('Chat Wars stream battle requires at least two channels.');
 const battleId='chatwars:'+channels.slice().sort().join('+'); const createdAt=new Date().toISOString();
 for(const channel of channels){ const settings=getChannelGameSettings(state,channel); settings.chatWarsBattle={battleId,channels,createdBy:normalizeGameHubChannel(input.createdBy),createdAt,active:input.active!==false}; setChannelGameRunning(state,channel,'chatwars',input.active!==false); }
 return {battleId,channels,createdAt,active:input.active!==false};
}
export function getChatWarsBattle(state:any,channelValue:unknown){ return getChannelGameSettings(state,channelValue).chatWarsBattle||null; }
