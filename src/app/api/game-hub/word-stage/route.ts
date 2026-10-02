import { NextRequest, NextResponse } from 'next/server';
import {
  advanceWordChainRound,
  resolveChannelGameIds,
  WORD_CHAIN_CYCLE_MS,
  WORD_CHAIN_REVIEW_MS,
  WORD_CHAIN_ROUND_MS,
  normalizeGameHubChannel,
  phraseGuessPublicSnapshot,
  streamGameBattlePublicSnapshot,
  wordChainPublicSnapshot,
} from '@/lib/game-hub-state';
import { readAppState, updateAppStateIfChanged } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const channel = normalizeGameHubChannel(req.nextUrl.searchParams.get('channel'));
  const gameId = String(req.nextUrl.searchParams.get('game') || '').toLowerCase();
  if (!channel) return NextResponse.json({ error: 'channel is required.' }, { status: 400 });
  if (gameId !== 'wordchain' && gameId !== 'phraseguess') {
    return NextResponse.json({ error: 'game must be wordchain or phraseguess.' }, { status: 400 });
  }
  let state = await readAppState();
  if (!resolveChannelGameIds(state, channel).includes(gameId)) return NextResponse.json({ gameId, stopped: true, snapshot: null, battle: null });
  if (gameId === 'wordchain') {
    const current = state.gameSettings?.default?.gameHub?.channels?.[channel]?.wordChainRound;
    const nowSlot = Math.floor(Date.now() / WORD_CHAIN_CYCLE_MS);
    if (current?.roundSlot !== nowSlot || (!current?.settled && Date.now() % WORD_CHAIN_CYCLE_MS >= WORD_CHAIN_ROUND_MS + WORD_CHAIN_REVIEW_MS)) {
      await updateAppStateIfChanged((draft) => {
        if (!resolveChannelGameIds(draft, channel).includes(gameId)) return { changed: false, result: null };
        const result = advanceWordChainRound(draft, channel);
        return { changed: result.changed, result: null };
      });
      state = await readAppState();
    }
  }
  const snapshot = gameId === 'wordchain'
    ? wordChainPublicSnapshot(state, channel)
    : phraseGuessPublicSnapshot(state, channel);
  const battle = streamGameBattlePublicSnapshot(state, channel, gameId);
  return NextResponse.json({ gameId, snapshot, battle }, { headers: { 'Cache-Control': 'no-store' } });
}
