import { getGameHubGame } from '@/lib/game-hub-registry';
import { normalizeGameHubChannel } from '@/lib/game-hub-state';
import type { JsonObject } from '@/lib/volume-store';

const STORE_KEY = 'gameHubInstructions';

export type GameHubInstructionState = {
  channel: string;
  visible: boolean;
  gameId: string;
  updatedAt: string;
};

function instructionStore(state: any, create = false): Record<string, GameHubInstructionState> {
  const current = state?.gameSettings?.default?.[STORE_KEY];
  if (current && typeof current === 'object') return current as Record<string, GameHubInstructionState>;
  if (!create) return {};
  state.gameSettings ||= { default: {} };
  state.gameSettings.default ||= {};
  return (state.gameSettings.default[STORE_KEY] ||= {}) as JsonObject as Record<string, GameHubInstructionState>;
}

export function getGameHubInstructions(state: any, channelValue: unknown): GameHubInstructionState | null {
  const channel = normalizeGameHubChannel(channelValue);
  const current = channel ? instructionStore(state)[channel] : null;
  if (!current) return null;
  const game = getGameHubGame(current.gameId);
  return game ? { ...current, channel, gameId: game.id, visible: Boolean(current.visible) } : null;
}

export function setGameHubInstructions(state: any, channelValue: unknown, gameIdValue: unknown): GameHubInstructionState {
  const channel = normalizeGameHubChannel(channelValue);
  if (!channel) throw new Error('A valid channel is required.');
  const game = getGameHubGame(String(gameIdValue || '').trim().toLowerCase());
  const next: GameHubInstructionState = {
    channel,
    visible: Boolean(game),
    gameId: game?.id || '',
    updatedAt: new Date().toISOString(),
  };
  instructionStore(state, true)[channel] = next;
  return next;
}
