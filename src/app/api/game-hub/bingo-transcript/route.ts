import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserFromRequest, isBotRequest } from '@/lib/auth';
import { normalizeGameHubChannel } from '@/lib/game-hub-state';
import { recordGameHubRuntimeAction } from '@/lib/game-hub-runtime';
import { queueStellaSpeech } from '@/lib/stella-tts';
import { ingestBingoTranscript } from '@/lib/shared-bingo';
import { updateAppStateIfChanged } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const botRequest = isBotRequest(req);
  const sessionUser = botRequest ? null : getSessionUserFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const channel = normalizeGameHubChannel(body.channel || body.tenant || sessionUser?.twitchUsername);
  const signedInChannel = normalizeGameHubChannel(sessionUser?.twitchUsername);
  const text = String(body.text || body.transcript || '').trim().slice(0, 1_000);
  if (!channel || !text) return NextResponse.json({ error: 'channel and text are required.' }, { status: 400 });
  if (!botRequest && (!sessionUser || signedInChannel !== channel)) {
    return NextResponse.json({ error: 'Only the broadcaster signed into this channel may feed Bingo transcripts.' }, { status: 403 });
  }
  const result = await updateAppStateIfChanged((state) => {
    const activity = ingestBingoTranscript(state, { channel, text });
    if (activity.triggered.length) {
      recordGameHubRuntimeAction(state, { channel, gameId: 'bingo', username: channel, displayName: channel, action: 'transcript', args: activity.triggered, message: text });
    }
    return { changed: activity.changed, result: activity };
  });
  for (const coordinate of result.blocked) {
    void queueStellaSpeech(`Stella defense! ${coordinate} was said, but nobody claimed it. That square belongs to the streamer now.`, channel);
  }
  return NextResponse.json({ ok: true, ...result });
}
