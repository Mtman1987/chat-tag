import { makeId, type JsonObject } from '@/lib/volume-store';
import { GAME_HUB_CATALOG, normalizeGameHubGameIds } from '@/lib/game-hub-registry';

export type GameOverlayLayout = 'rotation' | 'auto-grid' | 'stack' | 'focus';

export type GameOverlayProfile = {
  id: string;
  ownerUserId: string;
  ownerLogin: string;
  name: string;
  gameIds: string[];
  layout: GameOverlayLayout;
  transparent: boolean;
  createdAt: string;
  updatedAt: string;
};

function normalizeLayout(value: unknown): GameOverlayLayout {
  return value === 'stack' || value === 'focus' || value === 'auto-grid' ? value : 'rotation';
}

function normalizeLogin(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/^#/, '').slice(0, 80);
}

export function instantGameOverlayProfileId(channelValue: unknown, gameIdValue: unknown): string | null {
  const ownerLogin = normalizeLogin(channelValue);
  const gameId = String(gameIdValue || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{1,25}$/.test(ownerLogin)) return null;
  if (!GAME_HUB_CATALOG.some((game) => game.id === gameId)) return null;
  return `instant.${ownerLogin}.${gameId}`;
}

export function instantGameOverlayProfile(profileIdValue: unknown): GameOverlayProfile | null {
  const id = String(profileIdValue || '').trim().toLowerCase();
  const match = id.match(/^instant\.([a-z0-9_]{1,25})\.([a-z0-9-]{1,40})$/);
  if (!match || instantGameOverlayProfileId(match[1], match[2]) !== id) return null;
  const game = GAME_HUB_CATALOG.find((item) => item.id === match[2]);
  if (!game) return null;
  return {
    id,
    ownerUserId: `twitch-channel:${match[1]}`,
    ownerLogin: match[1],
    name: `${game.name} for #${match[1]}`,
    gameIds: [game.id],
    layout: 'focus',
    transparent: true,
    createdAt: 'instant',
    updatedAt: 'instant',
  };
}

export function normalizeGameOverlayProfile(value: JsonObject): GameOverlayProfile | null {
  const id = String(value?.id || '').trim();
  const ownerUserId = String(value?.ownerUserId || '').trim();
  if (!id || !ownerUserId) return null;
  return {
    id,
    ownerUserId,
    ownerLogin: normalizeLogin(value?.ownerLogin),
    name: String(value?.name || 'Nebula Arcade Overlay').trim().slice(0, 80) || 'Nebula Arcade Overlay',
    gameIds: normalizeGameHubGameIds(value?.gameIds),
    layout: normalizeLayout(value?.layout),
    transparent: value?.transparent !== false,
    createdAt: String(value?.createdAt || new Date().toISOString()),
    updatedAt: String(value?.updatedAt || new Date().toISOString()),
  };
}

export function createGameOverlayProfile(ownerUserId: string, input: JsonObject = {}): GameOverlayProfile {
  const now = new Date().toISOString();
  const gameIds = input.gameIds == null
    ? GAME_HUB_CATALOG.map((game) => game.id)
    : normalizeGameHubGameIds(input.gameIds);
  return {
    id: makeId('games_overlay'),
    ownerUserId,
    ownerLogin: normalizeLogin(input.ownerLogin),
    name: String(input.name || 'Nebula Arcade Overlay').trim().slice(0, 80) || 'Nebula Arcade Overlay',
    gameIds,
    layout: normalizeLayout(input.layout),
    transparent: input.transparent !== false,
    createdAt: now,
    updatedAt: now,
  };
}

export function patchGameOverlayProfile(
  existing: GameOverlayProfile,
  input: JsonObject,
): GameOverlayProfile {
  return {
    ...existing,
    ownerLogin: input.ownerLogin == null ? existing.ownerLogin : normalizeLogin(input.ownerLogin),
    name: input.name == null
      ? existing.name
      : (String(input.name).trim().slice(0, 80) || existing.name),
    gameIds: input.gameIds == null
      ? existing.gameIds
      : normalizeGameHubGameIds(input.gameIds),
    layout: input.layout == null ? existing.layout : normalizeLayout(input.layout),
    transparent: input.transparent == null ? existing.transparent : input.transparent !== false,
    updatedAt: new Date().toISOString(),
  };
}

export function cloneGameOverlayProfile(
  ownerUserId: string,
  existing: GameOverlayProfile,
  requestedName?: unknown,
): GameOverlayProfile {
  return createGameOverlayProfile(ownerUserId, {
    ownerLogin: existing.ownerLogin,
    name: String(requestedName || `${existing.name} Copy`),
    gameIds: existing.gameIds,
    layout: existing.layout,
    transparent: existing.transparent,
  });
}
