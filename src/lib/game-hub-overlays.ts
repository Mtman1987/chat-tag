import { makeId, type JsonObject } from '@/lib/volume-store';
import { normalizeGameHubGameIds } from '@/lib/game-hub-registry';

export type GameOverlayLayout = 'auto-grid' | 'stack' | 'focus';

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
  return value === 'stack' || value === 'focus' ? value : 'auto-grid';
}

function normalizeLogin(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/^#/, '').slice(0, 80);
}

export function normalizeGameOverlayProfile(value: JsonObject): GameOverlayProfile | null {
  const id = String(value?.id || '').trim();
  const ownerUserId = String(value?.ownerUserId || '').trim();
  if (!id || !ownerUserId) return null;
  return {
    id,
    ownerUserId,
    ownerLogin: normalizeLogin(value?.ownerLogin),
    name: String(value?.name || 'Games Overlay').trim().slice(0, 80) || 'Games Overlay',
    gameIds: normalizeGameHubGameIds(value?.gameIds),
    layout: normalizeLayout(value?.layout),
    transparent: value?.transparent !== false,
    createdAt: String(value?.createdAt || new Date().toISOString()),
    updatedAt: String(value?.updatedAt || new Date().toISOString()),
  };
}

export function createGameOverlayProfile(ownerUserId: string, input: JsonObject = {}): GameOverlayProfile {
  const now = new Date().toISOString();
  const gameIds = normalizeGameHubGameIds(input.gameIds);
  return {
    id: makeId('games_overlay'),
    ownerUserId,
    ownerLogin: normalizeLogin(input.ownerLogin),
    name: String(input.name || 'Games Overlay').trim().slice(0, 80) || 'Games Overlay',
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
