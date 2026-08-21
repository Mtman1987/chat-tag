import { makeId, type JsonObject } from '@/lib/volume-store';
import { getGameHubGame } from '@/lib/game-hub-registry';
import { normalizeGameHubChannel } from '@/lib/game-hub-state';

const STORE_KEY = 'gameHubRuntime';
const ACTION_LIMIT = 500;

export type GameHubRuntimeAction = {
  id: string;
  at: string;
  channel: string;
  gameId: string;
  actorId: string;
  username: string;
  displayName: string;
  action: string;
  args: string[];
  message: string;
};

type RuntimeStore = {
  channels: Record<string, {
    games: Record<string, {
      updatedAt: string;
      actions: GameHubRuntimeAction[];
    }>;
  }>;
};

function runtimeStore(state: any): RuntimeStore {
  state.gameSettings ||= { default: {} };
  state.gameSettings.default ||= {};
  const root = (state.gameSettings.default[STORE_KEY] ||= {}) as JsonObject;
  root.channels ||= {};
  return root as unknown as RuntimeStore;
}

export function recordGameHubRuntimeAction(
  state: any,
  input: {
    channel: unknown;
    gameId: unknown;
    actorId?: unknown;
    username?: unknown;
    displayName?: unknown;
    action?: unknown;
    args?: unknown[];
    message?: unknown;
  },
): GameHubRuntimeAction {
  const channel = normalizeGameHubChannel(input.channel);
  const game = getGameHubGame(String(input.gameId || '').trim().toLowerCase());
  if (!channel || !game) throw new Error('Valid channel and game are required.');

  const username = normalizeGameHubChannel(input.username);
  const displayName = String(input.displayName || username).trim().slice(0, 80) || username;
  const action = String(input.action || 'join').trim().toLowerCase().slice(0, 40) || 'join';
  const args = Array.isArray(input.args)
    ? input.args.map((value) => String(value || '').trim().slice(0, 80)).filter(Boolean).slice(0, 8)
    : [];
  const event: GameHubRuntimeAction = {
    id: makeId('game_action'),
    at: new Date().toISOString(),
    channel,
    gameId: game.id,
    actorId: String(input.actorId || '').trim().slice(0, 100),
    username,
    displayName,
    action,
    args,
    message: String(input.message || '').trim().slice(0, 500),
  };

  const store = runtimeStore(state);
  const channelState = (store.channels[channel] ||= { games: {} });
  const gameState = (channelState.games[game.id] ||= { updatedAt: event.at, actions: [] });
  gameState.actions = [...(Array.isArray(gameState.actions) ? gameState.actions : []), event].slice(-ACTION_LIMIT);
  gameState.updatedAt = event.at;
  return event;
}

export function getGameHubRuntimeActions(
  state: any,
  channelValue: unknown,
  options: { gameIds?: string[]; after?: string; limit?: number } = {},
): GameHubRuntimeAction[] {
  const channel = normalizeGameHubChannel(channelValue);
  if (!channel) return [];
  const store = runtimeStore(state);
  const channelState = store.channels[channel];
  if (!channelState?.games) return [];

  const allowed = options.gameIds?.length ? new Set(options.gameIds) : null;
  const all = Object.entries(channelState.games)
    .filter(([gameId]) => !allowed || allowed.has(gameId))
    .flatMap(([, value]) => Array.isArray(value.actions) ? value.actions : [])
    .sort((left, right) => left.at.localeCompare(right.at));
  const afterIndex = options.after ? all.findIndex((item) => item.id === options.after) : -1;
  const limit = Math.max(1, Math.min(250, Number(options.limit || 100)));
  return (afterIndex >= 0 ? all.slice(afterIndex + 1) : all).slice(-limit);
}
