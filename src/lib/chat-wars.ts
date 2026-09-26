import {
  awardGameHubPoints,
  getChannelGameSettings,
  getGameHubStore,
  joinGameHubGame,
  normalizeGameHubChannel,
  normalizeGameHubPlayerId,
  getChatWarsBattle,
} from '@/lib/game-hub-state';

export const CHAT_WARS_WIDTH = 20;
export const CHAT_WARS_HEIGHT = 25;
export const CHAT_WARS_GAME_ID = 'chatwars';
export const CHAT_WARS_HALFTIME_MS = 60_000;
export const CHAT_WARS_TEAMS = ['red', 'blue', 'green', 'yellow'] as const;
export type ChatWarsTeam = typeof CHAT_WARS_TEAMS[number];
type ChatWarsTile = ChatWarsTeam | 'gray';
type ChatWarsPhase = 'first-half' | 'halftime' | 'second-half' | 'complete';

type ChatWarsPlayer = {
  team: ChatWarsTeam;
  eligibleMessages: number;
  level: number;
  lastMessage?: string;
  updatedAt: string;
};

type ChatWarsState = {
  width: number;
  height: number;
  halves: [ChatWarsTile[], ChatWarsTile[]];
  activeHalf: 1 | 2;
  phase: ChatWarsPhase;
  halftimeStartedAt?: string;
  halftimeEndsAt?: string;
  players: Record<string, ChatWarsPlayer>;
  updatedAt: string;
};

function iso(now: number) { return new Date(now).toISOString(); }
function emptyTiles(): ChatWarsTile[] {
  return Array.from({ length: CHAT_WARS_WIDTH * CHAT_WARS_HEIGHT }, () => 'gray');
}
function emptyState(now: number): ChatWarsState {
  return {
    width: CHAT_WARS_WIDTH,
    height: CHAT_WARS_HEIGHT,
    halves: [emptyTiles(), emptyTiles()],
    activeHalf: 1,
    phase: 'first-half',
    players: {},
    updatedAt: iso(now),
  };
}
function validTiles(value: unknown): value is ChatWarsTile[] {
  return Array.isArray(value) && value.length === CHAT_WARS_WIDTH * CHAT_WARS_HEIGHT;
}

export function getChatWarsState(state: any, channelValue: unknown, now = Date.now()): ChatWarsState {
  const settings = getChannelGameSettings(state, channelValue) as any;
  const existing = settings.chatWars;
  if (!existing) settings.chatWars = emptyState(now);
  else if (!Array.isArray(existing.halves)) {
    // Preserve territory from the original one-board version when migrating.
    const firstHalf = validTiles(existing.tiles) ? existing.tiles : emptyTiles();
    const full = !firstHalf.includes('gray');
    settings.chatWars = {
      ...emptyState(now),
      ...existing,
      halves: [firstHalf, emptyTiles()],
      activeHalf: 1,
      phase: full ? 'halftime' : 'first-half',
      halftimeStartedAt: full ? iso(now) : undefined,
      halftimeEndsAt: full ? iso(now + CHAT_WARS_HALFTIME_MS) : undefined,
    };
    delete settings.chatWars.tiles;
  }
  const game = settings.chatWars as ChatWarsState;
  if (!validTiles(game.halves?.[0]) || !validTiles(game.halves?.[1])) settings.chatWars = emptyState(now);
  settings.chatWars.players = settings.chatWars.players && typeof settings.chatWars.players === 'object'
    ? settings.chatWars.players
    : {};
  return settings.chatWars as ChatWarsState;
}

function levelForMessages(messages: number) {
  let level = 1;
  let threshold = 10;
  while (messages >= threshold) {
    level += 1;
    threshold += level * 10;
  }
  return level;
}

export function chatWarsMinimumWordLength(level: number) {
  return Math.min(8, 3 + Math.floor((Math.max(1, level) - 1) / 2));
}

function chooseIndex(indices: number[], random: () => number) {
  if (!indices.length) return -1;
  return indices[Math.min(indices.length - 1, Math.floor(Math.max(0, random()) * indices.length))];
}

function countTeams(tiles: ChatWarsTile[]) {
  const counts = Object.fromEntries(CHAT_WARS_TEAMS.map((team) => [team, 0])) as Record<ChatWarsTeam, number>;
  for (const tile of tiles) if (tile !== 'gray') counts[tile] += 1;
  return counts;
}

function halftimeSnapshot(game: ChatWarsState) {
  const counts = countTeams(game.halves[0]);
  const ranked = CHAT_WARS_TEAMS.slice().sort((left, right) => counts[right] - counts[left]);
  return {
    startedAt: game.halftimeStartedAt,
    endsAt: game.halftimeEndsAt,
    counts,
    // Ready for TBD perks/blockers without charging players during testing.
    priceWeights: Object.fromEntries(ranked.map((team, index) => [team, [1.5, 1.15, 0.85, 0.6][index]])),
  };
}

function advanceFromHalftime(game: ChatWarsState, now: number) {
  if (game.phase !== 'halftime') return;
  const endsAt = Date.parse(String(game.halftimeEndsAt || ''));
  if (Number.isFinite(endsAt) && now < endsAt) return;
  game.phase = 'second-half';
  game.activeHalf = 2;
  game.updatedAt = iso(now);
}

export function setChatWarsTeam(
  state: any,
  input: { channel: unknown; userId?: unknown; username?: unknown; displayName?: unknown; team: unknown; now?: number },
) {
  const team = String(input.team || '').toLowerCase() as ChatWarsTeam;
  if (!CHAT_WARS_TEAMS.includes(team)) throw new Error('Choose red, blue, green, or yellow.');
  const channel = normalizeGameHubChannel(input.channel);
  const now = Math.max(0, Math.floor(Number(input.now ?? Date.now())));
  const joined = joinGameHubGame(state, { ...input, gameId: CHAT_WARS_GAME_ID });
  const game = getChatWarsState(state, channel, now);
  const current = game.players[joined.player.id];
  if (current && current.team !== team) return { ...current, locked: true as const };
  game.players[joined.player.id] = current || { team, eligibleMessages: 0, level: 1, updatedAt: iso(now) };
  game.updatedAt = iso(now);
  return { ...game.players[joined.player.id], locked: false as const };
}

export function getChatWarsPlayer(state: any, input: { channel: unknown; userId?: unknown; username?: unknown }) {
  const playerId = normalizeGameHubPlayerId(input.userId, input.username);
  return getChatWarsState(state, input.channel).players[playerId] || null;
}

export function recordChatWarsMessage(
  state: any,
  input: { channel: unknown; userId?: unknown; username?: unknown; displayName?: unknown; message?: unknown; now?: number; random?: () => number },
) {
  const channel = normalizeGameHubChannel(input.channel);
  const now = Math.max(0, Math.floor(Number(input.now ?? Date.now())));
  const random = input.random || Math.random;
  const playerId = normalizeGameHubPlayerId(input.userId, input.username);
  const game = getChatWarsState(state, channel, now);
  advanceFromHalftime(game, now);
  if (game.phase === 'halftime') return { changed: false, outcome: 'halftime' as const, halftime: halftimeSnapshot(game) };
  if (game.phase === 'complete') return { changed: false, outcome: 'complete' as const };
  const warPlayer = game.players[playerId];
  if (!warPlayer) return { changed: false, outcome: 'no-team' as const };

  const normalized = String(input.message || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!normalized || normalized === warPlayer.lastMessage) return { changed: false, outcome: 'duplicate' as const };
  const minimumLength = chatWarsMinimumWordLength(warPlayer.level);
  const words = [...new Set(normalized.match(/[a-z][a-z'-]*/g) || [])]
    .filter((word) => word.replace(/[^a-z]/g, '').length >= minimumLength)
    .slice(0, 5);
  if (!words.length) return { changed: false, outcome: 'too-short' as const, minimumLength };

  warPlayer.eligibleMessages += 1;
  warPlayer.level = levelForMessages(warPlayer.eligibleMessages);
  warPlayer.lastMessage = normalized;
  warPlayer.updatedAt = iso(now);
  const basePoints = words.reduce((sum, word) => {
    const length = word.replace(/[^a-z]/g, '').length;
    return sum + Math.min(4, 1 + Math.floor((length - minimumLength) / 2));
  }, 0);
  const points = basePoints * warPlayer.level;
  const joined = joinGameHubGame(state, { ...input, gameId: CHAT_WARS_GAME_ID });
  joined.membership.score += points;
  joined.membership.lastActiveAt = iso(now);
  awardGameHubPoints(state, joined.player, points, 'Chat Wars message', { gameId: CHAT_WARS_GAME_ID, channel });

  const tiles = game.halves[game.activeHalf - 1];
  const captures = Math.max(1, warPlayer.level);
  let stolen = 0;
  if (warPlayer.level > 5) {
    const stealChance = Math.min(0.75, (warPlayer.level - 5) * 0.15);
    if (random() < stealChance) {
      const counts = countTeams(tiles);
      const leadingOpponent = CHAT_WARS_TEAMS.filter((team) => team !== warPlayer.team)
        .sort((left, right) => counts[right] - counts[left])[0];
      const opponentTiles = tiles.flatMap((tile, index) => tile === leadingOpponent ? [index] : []);
      const stolenIndex = chooseIndex(opponentTiles, random);
      if (stolenIndex >= 0) { tiles[stolenIndex] = warPlayer.team; stolen = 1; }
    }
  }
  const neutralTiles = tiles.flatMap((tile, index) => tile === 'gray' ? [index] : []);
  let claimed = 0;
  for (let attempt = stolen; attempt < captures && neutralTiles.length; attempt += 1) {
    const choice = Math.min(neutralTiles.length - 1, Math.floor(Math.max(0, random()) * neutralTiles.length));
    const [tileIndex] = neutralTiles.splice(choice, 1);
    tiles[tileIndex] = warPlayer.team;
    claimed += 1;
  }

  let halftime: ReturnType<typeof halftimeSnapshot> | undefined;
  if (!tiles.includes('gray')) {
    if (game.activeHalf === 1) {
      game.phase = 'halftime';
      game.halftimeStartedAt = iso(now);
      game.halftimeEndsAt = iso(now + CHAT_WARS_HALFTIME_MS);
      halftime = halftimeSnapshot(game);
    } else game.phase = 'complete';
  }
  game.updatedAt = iso(now);
  return {
    changed: true,
    outcome: halftime ? 'halftime-started' as const : game.phase === 'complete' ? 'complete' as const : 'scored' as const,
    team: warPlayer.team,
    level: warPlayer.level,
    minimumLength: chatWarsMinimumWordLength(warPlayer.level),
    qualifyingWords: words,
    points,
    claimed,
    stolen,
    activeHalf: game.activeHalf,
    halftime,
  };
}

function combinedTiles(game: ChatWarsState) {
  const output: ChatWarsTile[] = [];
  for (let row = 0; row < CHAT_WARS_HEIGHT; row += 1) {
    const offset = row * CHAT_WARS_WIDTH;
    output.push(...game.halves[0].slice(offset, offset + CHAT_WARS_WIDTH));
    output.push(...game.halves[1].slice(offset, offset + CHAT_WARS_WIDTH));
  }
  return output;
}

export function chatWarsPublicSnapshot(state: any, channelValue: unknown, now = Date.now()) {
  const channel = normalizeGameHubChannel(channelValue);
  const game = getChatWarsState(state, channel, now);
  advanceFromHalftime(game, now);
  const store = getGameHubStore(state);
  const activeTiles = game.halves[game.activeHalf - 1];
  const allTiles = [...game.halves[0], ...game.halves[1]];
  const leaderboard = Object.entries(game.players)
    .map(([playerId, warPlayer]) => {
      const player = store.players[playerId];
      return {
        username: player?.displayName || player?.username || playerId,
        team: warPlayer.team,
        level: warPlayer.level,
        score: Number(player?.joinedGames?.chatwars?.score || 0),
      };
    })
    .sort((left, right) => right.score - left.score || right.level - left.level)
    .slice(0, 10);
  return {
    width: game.width,
    height: game.height,
    tiles: activeTiles,
    counts: countTeams(activeTiles),
    totalCounts: countTeams(allTiles),
    leaderboard,
    activeHalf: game.activeHalf,
    phase: game.phase,
    halftime: game.phase === 'halftime' ? halftimeSnapshot(game) : null,
    combined: { width: CHAT_WARS_WIDTH * 2, height: CHAT_WARS_HEIGHT, tiles: combinedTiles(game) },
    updatedAt: game.updatedAt,
  };
}

export function compactChatWarsReveal(state: any, channelValue: unknown) {
  const snapshot = chatWarsPublicSnapshot(state, channelValue);
  const codes: Record<ChatWarsTile, string> = { gray: '.', red: 'r', blue: 'b', green: 'g', yellow: 'y' };
  return {
    width: snapshot.combined.width,
    height: snapshot.combined.height,
    tiles: snapshot.combined.tiles.map((tile) => codes[tile]).join(''),
    teams: CHAT_WARS_TEAMS.map((team) => ({ team, score: snapshot.totalCounts[team] })),
    players: snapshot.leaderboard.slice(0, 5),
    activeHalf: snapshot.activeHalf,
    phase: snapshot.phase,
  };
}

export function chatWarsStreamBattleSnapshot(state:any,channelValue:unknown){
 const battle=getChatWarsBattle(state,channelValue); if(!battle?.active) return null;
 const channels=battle.channels.map((channel:string)=>{ const snapshot=chatWarsPublicSnapshot(state,channel); const territory=Object.values(snapshot.totalCounts).reduce((sum:number,value:any)=>sum+Number(value||0),0); return {channel,territory,phase:snapshot.phase,activeHalf:snapshot.activeHalf,updatedAt:snapshot.updatedAt}; });
 return {...battle,channels};
}
