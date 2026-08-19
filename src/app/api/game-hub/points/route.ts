import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import {
  getGameHubStore,
  getOrCreateGameHubPlayer,
  normalizeGameHubPlayerId,
  spendGameHubPoints,
} from '@/lib/game-hub-state';
import { readAppState, updateAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

function wallet(player: any) {
  return {
    balance: Number(player?.gamePointsBalance || 0),
    lifetimeEarned: Number(player?.lifetimeEarned || 0),
    lifetimeSpent: Number(player?.lifetimeSpent || 0),
  };
}

export async function GET(req: NextRequest) {
  const user = getSessionUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'SPMT authentication required.' }, { status: 401 });
  const state = await readAppState();
  const store = getGameHubStore(state);
  const playerId = normalizeGameHubPlayerId(user.id, user.twitchUsername);
  return NextResponse.json({ wallet: wallet(store.players[playerId]) });
}

export async function POST(req: NextRequest) {
  const user = getSessionUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'SPMT authentication required.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const amount = Math.floor(Number(body.amount || 0));
  const reason = String(body.reason || 'Games Hub purchase').trim().slice(0, 160);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'A positive spend amount is required.' }, { status: 400 });
  }

  try {
    const result = await updateAppState((state) => {
      const player = getOrCreateGameHubPlayer(state, {
        userId: user.id,
        username: user.twitchUsername,
        displayName: user.twitchUsername,
      });
      spendGameHubPoints(state, player, amount, reason);
      return wallet(player);
    });
    return NextResponse.json({ wallet: result });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to spend Games Points.' }, { status: 400 });
  }
}
