import type { NextRequest } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import { getGameHubGame } from '@/lib/game-hub-catalog';

export function controllerAccess(req: NextRequest, input: { channel?: unknown; gameId?: unknown }) {
  const user = getSessionUserFromRequest(req);
  if (!user) return { ok: false as const, status: 401, error: 'Sign in to manage your game.' };
  const channel = String(input.channel || user.twitchUsername || '').trim().toLowerCase().replace(/^#/, '');
  const game = getGameHubGame(String(input.gameId || ''));
  if (!/^[a-z0-9_]{1,25}$/.test(channel) || !game) return { ok: false as const, status: 400, error: 'Choose a valid channel and game.' };
  if (channel !== String(user.twitchUsername).toLowerCase() && req.headers.get('x-spmt-is-admin') !== '1') return { ok: false as const, status: 403, error: 'Only the channel owner can manage this game connection.' };
  return { ok: true as const, channel, game };
}
