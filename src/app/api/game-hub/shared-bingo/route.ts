import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import { resolveChannelGameIds } from '@/lib/game-hub-state';
import { queueStellaSpeech } from '@/lib/stella-tts';
import { getSharedBingoState, settleExpiredBingoClaims, sharedBingoPublicSnapshot } from '@/lib/shared-bingo';
import { readAppState, updateAppStateIfChanged } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const channel = String(req.nextUrl.searchParams.get('channel') || '').trim();
  if (!channel) return NextResponse.json({ error: 'channel is required.' }, { status: 400 });
  const includePhrases = req.nextUrl.searchParams.get('view') === 'player' && Boolean(getSessionUserFromRequest(req));
  const current = await readAppState();
  const now = Date.now();
  const claimDue = getSharedBingoState(current, channel, now).squares.some(square =>
    square.status === 'pending' && square.claimUntil && !(Date.parse(square.claimUntil) > now));
  // Read-only polls stay off the global write queue; expiry still rechecks
  // under the lock so a concurrent player claim cannot be overwritten.
  if (!resolveChannelGameIds(current, channel).includes('bingo') || !claimDue) {
    return NextResponse.json(sharedBingoPublicSnapshot(current, channel, { includePhrases, now }),
      { headers: { 'Cache-Control': 'no-store' } });
  }
  const result = await updateAppStateIfChanged((state) => {
    const settled = resolveChannelGameIds(state, channel).includes('bingo')
      ? settleExpiredBingoClaims(state, channel) : { changed: false, blocked: [] };
    return { changed: settled.changed, result: { snapshot: sharedBingoPublicSnapshot(state, channel, { includePhrases }), blocked: settled.blocked } };
  });
  for (const coordinate of result.blocked) {
    void queueStellaSpeech(`Stella defense! ${coordinate} was said, but nobody claimed it. That square belongs to the streamer now.`, channel);
  }
  return NextResponse.json(result.snapshot, { headers: { 'Cache-Control': 'no-store' } });
}
