import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import { getBotSecret } from '@/lib/runtime-secrets';
import { POST as runGameHubCommand } from '@/app/api/game-hub/command/route';
import { normalizeGameHubChannel } from '@/lib/game-hub-state';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = getSessionUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Sign in with SPMT to use a Nebula Controller.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const signedInChannel = normalizeGameHubChannel(user.twitchUsername);
  const channel = normalizeGameHubChannel(body.channel || signedInChannel);
  if (!channel) return NextResponse.json({ error: 'A channel is required.' }, { status: 400 });
  const isAdmin = req.headers.get('x-spmt-is-admin') === '1';
  if (!isAdmin && channel !== signedInChannel) {
    return NextResponse.json({ error: 'This controller can only operate your own channel.' }, { status: 403 });
  }
  const message = String(body.message || '').trim().slice(0, 400);
  if (!message) return NextResponse.json({ error: 'Type a command first.' }, { status: 400 });

  const forwarded = new NextRequest(new URL('/api/game-hub/command', req.url), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-bot-secret': getBotSecret(),
    },
    body: JSON.stringify({
      channel,
      userId: user.id,
      username: signedInChannel || user.twitchUsername,
      displayName: user.twitchUsername,
      message,
      isBroadcaster: channel === signedInChannel,
      isAdmin,
      source: 'nebula-controller',
    }),
  });
  const result = await runGameHubCommand(forwarded);
  const payload = await result.json().catch(() => ({}));
  return NextResponse.json({ ...payload, privateController: true }, { status: result.status });
}
