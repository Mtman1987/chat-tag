import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import { getBotSecret } from '@/lib/runtime-secrets';
import { POST as runGameHubCommand } from '@/app/api/game-hub/command/route';
import { POST as runGameHubChat } from '@/app/api/game-hub/chat/route';
import { normalizeGameHubChannel } from '@/lib/game-hub-state';

import { normalizeControllerCommand, isPlayerMosaicCommand } from '@/lib/mosaic-controller-command';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = getSessionUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Sign in with SPMT to use a Nebula Controller.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const signedInChannel = normalizeGameHubChannel(user.twitchUsername);
  const channel = normalizeGameHubChannel(body.channel || signedInChannel);
  if (!channel) return NextResponse.json({ error: 'A channel is required.' }, { status: 400 });
  const isAdmin = req.headers.get('x-spmt-is-admin') === '1';
  const rawMessage = String(body.message || '').trim().slice(0, 400);
  const message = body.commandMode === true && rawMessage ? normalizeControllerCommand(rawMessage, body.gameId) : rawMessage;
  const playerCommand = body.commandMode === true && body.gameId === 'pixelbattle' && isPlayerMosaicCommand(message);
  if (!isAdmin && channel !== signedInChannel && !playerCommand) {
    return NextResponse.json({ error: 'This controller can only operate your own channel.' }, { status: 403 });
  }
  if (!message) return NextResponse.json({ error: 'Type a command first.' }, { status: 400 });

  const identity = {
    channel,
    userId: user.id,
    username: signedInChannel || user.twitchUsername,
    displayName: user.twitchUsername,
    message,
    isBroadcaster: channel === signedInChannel,
    isAdmin,
    source: 'nebula-controller',
  };
  const headers = {
    'content-type': 'application/json',
    'x-bot-secret': getBotSecret(),
  };

  const commandResult = await runGameHubCommand(new NextRequest(new URL('/api/game-hub/command', req.url), {
    method: 'POST',
    headers,
    body: JSON.stringify(identity),
  }));
  const commandPayload = await commandResult.json().catch(() => ({}));
  if (commandResult.status >= 400 || commandPayload.handled !== false) {
    return NextResponse.json({ ...commandPayload, privateController: true, privateChannel: true, mode: 'command' }, { status: commandResult.status });
  }

  if (playerCommand) return NextResponse.json({ handled: true, reply: 'That Mosaic command was not recognized.', privateController: true }, { status: 400 });

  const chatResult = await runGameHubChat(new NextRequest(new URL('/api/game-hub/chat', req.url), {
    method: 'POST',
    headers,
    body: JSON.stringify(identity),
  }));
  const chatPayload = await chatResult.json().catch(() => ({}));
  const eventGameIds = Array.isArray(chatPayload.eventGameIds) ? chatPayload.eventGameIds : [];
  const reply = chatPayload.skipped
    ? `#${channel} has no active Nebula game to receive that private test message.`
    : eventGameIds.length
      ? `Private #${channel} game chat accepted for ${eventGameIds.join(', ')}.`
      : `Private #${channel} game chat accepted.`;
  return NextResponse.json({
    ...chatPayload,
    reply,
    privateController: true,
    privateChannel: true,
    mode: 'chat',
  }, { status: chatResult.status });
}

