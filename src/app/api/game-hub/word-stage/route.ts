import { NextRequest, NextResponse } from 'next/server';
import {
  normalizeGameHubChannel,
  phraseGuessPublicSnapshot,
  wordChainPublicSnapshot,
} from '@/lib/game-hub-state';
import { readAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const channel = normalizeGameHubChannel(req.nextUrl.searchParams.get('channel'));
  const gameId = String(req.nextUrl.searchParams.get('game') || '').toLowerCase();
  if (!channel) return NextResponse.json({ error: 'channel is required.' }, { status: 400 });
  if (gameId !== 'wordchain' && gameId !== 'phraseguess') {
    return NextResponse.json({ error: 'game must be wordchain or phraseguess.' }, { status: 400 });
  }
  const state = await readAppState();
  const snapshot = gameId === 'wordchain'
    ? wordChainPublicSnapshot(state, channel)
    : phraseGuessPublicSnapshot(state, channel);
  return NextResponse.json({ gameId, snapshot }, { headers: { 'Cache-Control': 'no-store' } });
}
