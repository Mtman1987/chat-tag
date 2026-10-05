import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isBotRequest, isStreamWeaverGameHubRequest } from '@/lib/auth';
import { updateAppState } from '@/lib/volume-store';
import { lookupTwitchUser } from '@/lib/twitch';
import { awardCheckinNebulaBonus } from '@/lib/checkin-nebula-bonus';

export const dynamic = 'force-dynamic';
const schema = z.object({
  awardId: z.string().min(1).max(160),
  channel: z.string().regex(/^[a-z0-9_]{1,80}$/),
  userId: z.string().max(80).optional(),
  username: z.string().regex(/^[a-z0-9_]{1,25}$/),
  displayName: z.string().min(1).max(80).optional(),
}).strict();

export async function POST(req: NextRequest) {
  if (!isBotRequest(req) && !isStreamWeaverGameHubRequest(req)) {
    return NextResponse.json({ error: 'Service authorization required.' }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid check-in award.' }, { status: 400 });
  const input = parsed.data;
  let userId = String(input.userId || '').replace(/^user_/, '');
  if (!/^\d+$/.test(userId)) {
    const user = await lookupTwitchUser(input.username);
    if (!user?.id || user.login.toLowerCase() !== input.username) {
      return NextResponse.json({ error: 'Could not resolve the front-seat rider.' }, { status: 503 });
    }
    userId = user.id;
  }
  try {
    const award = await updateAppState(state => awardCheckinNebulaBonus(state, { ...input, userId }));
    console.info('[CheckinNebulaBonus]', JSON.stringify({ channel: input.channel, ...award }));
    return NextResponse.json({ ok: true, award });
  } catch (error) {
    console.error('[CheckinNebulaBonus] Award could not be saved', error);
    return NextResponse.json({ error: 'Nebula bonus could not be saved.' }, { status: 500 });
  }
}
