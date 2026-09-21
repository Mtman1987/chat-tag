import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import { queueStellaSpeech } from '@/lib/stella-tts';
import { settleExpiredBingoClaims, sharedBingoPublicSnapshot } from '@/lib/shared-bingo';
import { updateAppStateIfChanged } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const channel = String(req.nextUrl.searchParams.get('channel') || '').trim();
  if (!channel) return NextResponse.json({ error: 'channel is required.' }, { status: 400 });
  const includePhrases = req.nextUrl.searchParams.get('view') === 'player' && Boolean(getSessionUserFromRequest(req));
  const result = await updateAppStateIfChanged((state) => {
    const settled = settleExpiredBingoClaims(state, channel);
    return { changed: settled.changed, result: { snapshot: sharedBingoPublicSnapshot(state, channel, { includePhrases }), blocked: settled.blocked } };
  });
  for (const coordinate of result.blocked) {
    void queueStellaSpeech(`Stella defense! ${coordinate} was said, but nobody claimed it. That square belongs to the streamer now.`, channel);
  }
  return NextResponse.json(result.snapshot, { headers: { 'Cache-Control': 'no-store' } });
}
