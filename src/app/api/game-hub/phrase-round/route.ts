import { NextRequest, NextResponse } from 'next/server';
import { normalizeGameHubChannel, phraseGuessRoundForChannel } from '@/lib/game-hub-state';
import { readAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const channel = normalizeGameHubChannel(req.nextUrl.searchParams.get('channel'));
  if (!channel) return NextResponse.json({ error: 'channel is required.' }, { status: 400 });
  const state = await readAppState();
  const round = phraseGuessRoundForChannel(state, channel, Date.now());
  return NextResponse.json({
    round: {
      roundSlot: round.roundSlot,
      phrase: round.phrase,
      phraseId: round.phraseId,
      submitterDisplayName: round.submitterDisplayName || '',
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
