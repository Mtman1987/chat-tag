import type { JsonObject } from '@/lib/volume-store';
import { normalizeGameHubChannel } from '@/lib/game-hub-state';

export const PIXEL_BATTLE_WIDTH = 12;
export const PIXEL_BATTLE_HEIGHT = 8;
export const PIXEL_BATTLE_COLORS = [
  'red', 'blue', 'green', 'yellow', 'purple',
  'orange', 'pink', 'white', 'black', 'cyan',
] as const;

export type PixelBattleColor = typeof PIXEL_BATTLE_COLORS[number];

export type PixelBattleCell = {
  color: PixelBattleColor;
  playerId: string;
  username: string;
  displayName: string;
  at: string;
};

export type PixelBattleArtist = {
  playerId: string;
  username: string;
  displayName: string;
  paints: number;
  lastPaintAt: string;
};

export type PixelBattleBoard = {
  width: number;
  height: number;
  cells: Record<string, PixelBattleCell>;
  artists: Record<string, PixelBattleArtist>;
  totalPaints: number;
  updatedAt?: string;
  resetAt?: string;
};

function root(state: any): Record<string, PixelBattleBoard> {
  state.gameSettings ||= { default: {} };
  state.gameSettings.default ||= {};
  const games = (state.gameSettings.default.gameHubGameState ||= {}) as JsonObject;
  games.pixelbattle ||= {};
  return games.pixelbattle as Record<string, PixelBattleBoard>;
}

function blankBoard(): PixelBattleBoard {
  return {
    width: PIXEL_BATTLE_WIDTH,
    height: PIXEL_BATTLE_HEIGHT,
    cells: {},
    artists: {},
    totalPaints: 0,
  };
}

function normalizeColor(value: unknown): PixelBattleColor | null {
  const color = String(value || '').trim().toLowerCase();
  return PIXEL_BATTLE_COLORS.includes(color as PixelBattleColor) ? color as PixelBattleColor : null;
}

function normalizeBoard(value: any): PixelBattleBoard {
  const board = blankBoard();
  board.totalPaints = Math.max(0, Math.floor(Number(value?.totalPaints || 0)));
  board.updatedAt = value?.updatedAt ? String(value.updatedAt) : undefined;
  board.resetAt = value?.resetAt ? String(value.resetAt) : undefined;

  for (const [key, raw] of Object.entries(value?.cells || {})) {
    if (!/^\d{1,2},\d{1,2}$/.test(key)) continue;
    const color = normalizeColor((raw as any)?.color);
    if (!color) continue;
    board.cells[key] = {
      color,
      playerId: String((raw as any)?.playerId || ''),
      username: normalizeGameHubChannel((raw as any)?.username),
      displayName: String((raw as any)?.displayName || (raw as any)?.username || '').trim().slice(0, 80),
      at: String((raw as any)?.at || ''),
    };
  }

  for (const [playerId, raw] of Object.entries(value?.artists || {})) {
    const paints = Math.max(0, Math.floor(Number((raw as any)?.paints || 0)));
    if (!playerId || !paints) continue;
    board.artists[playerId] = {
      playerId,
      username: normalizeGameHubChannel((raw as any)?.username),
      displayName: String((raw as any)?.displayName || (raw as any)?.username || '').trim().slice(0, 80),
      paints,
      lastPaintAt: String((raw as any)?.lastPaintAt || ''),
    };
  }
  return board;
}

export function readPixelBattleBoard(state: any, channelValue: unknown): PixelBattleBoard {
  const channel = normalizeGameHubChannel(channelValue);
  if (!channel) return blankBoard();
  return normalizeBoard((state.gameSettings?.default?.gameHubGameState as any)?.pixelbattle?.[channel]);
}

export function paintPixelBattle(state: any, input: {
  channel: unknown;
  playerId: string;
  username: unknown;
  displayName: unknown;
  color: unknown;
  x: unknown;
  y: unknown;
}) {
  const channel = normalizeGameHubChannel(input.channel);
  const color = normalizeColor(input.color);
  const x = Math.floor(Number(input.x));
  const y = Math.floor(Number(input.y));
  if (!channel || !input.playerId) throw new Error('A channel and player identity are required.');
  if (!color) throw new Error(`Choose a color: ${PIXEL_BATTLE_COLORS.join(', ')}.`);
  if (!Number.isInteger(x) || x < 1 || x > PIXEL_BATTLE_WIDTH || !Number.isInteger(y) || y < 1 || y > PIXEL_BATTLE_HEIGHT) {
    throw new Error(`Pixel coordinates are X 1-${PIXEL_BATTLE_WIDTH}, Y 1-${PIXEL_BATTLE_HEIGHT}.`);
  }

  const store = root(state);
  const board = normalizeBoard(store[channel]);
  const key = `${x},${y}`;
  const previous = board.cells[key];
  const username = normalizeGameHubChannel(input.username);
  const displayName = String(input.displayName || username).trim().slice(0, 80) || username;

  if (previous?.color === color && previous?.playerId === input.playerId) {
    store[channel] = board;
    return { board, changed: false, x, y, color, artistPaints: board.artists[input.playerId]?.paints || 0 };
  }

  const now = new Date().toISOString();
  board.cells[key] = { color, playerId: input.playerId, username, displayName, at: now };
  const artist = board.artists[input.playerId] || {
    playerId: input.playerId,
    username,
    displayName,
    paints: 0,
    lastPaintAt: now,
  };
  artist.username = username;
  artist.displayName = displayName;
  artist.paints += 1;
  artist.lastPaintAt = now;
  board.artists[input.playerId] = artist;
  board.totalPaints += 1;
  board.updatedAt = now;
  store[channel] = board;

  return { board, changed: true, x, y, color, artistPaints: artist.paints };
}

export function resetPixelBattle(state: any, channelValue: unknown) {
  const channel = normalizeGameHubChannel(channelValue);
  if (!channel) throw new Error('A channel is required.');
  const board = blankBoard();
  board.resetAt = new Date().toISOString();
  board.updatedAt = board.resetAt;
  root(state)[channel] = board;
  return board;
}

export function publicPixelBattleBoard(state: any, channelValue: unknown) {
  const board = readPixelBattleBoard(state, channelValue);
  return {
    width: board.width,
    height: board.height,
    cells: board.cells,
    totalPaints: board.totalPaints,
    updatedAt: board.updatedAt || null,
    resetAt: board.resetAt || null,
    artists: Object.values(board.artists)
      .sort((a, b) => b.paints - a.paints || b.lastPaintAt.localeCompare(a.lastPaintAt))
      .slice(0, 20),
  };
}
