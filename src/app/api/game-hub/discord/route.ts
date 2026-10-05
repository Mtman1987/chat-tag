import { NextRequest, NextResponse } from 'next/server';
import { controllerAccess } from '@/lib/controller-access';
import { GameDiscordError, getGameDiscordConnection, saveGameDiscordConnection, removeGameDiscordConnection } from '@/lib/game-discord-connections';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function handle(req: NextRequest) {
  if (req.method !== 'GET' && !req.headers.get('content-type')?.includes('application/json')) return json({ error: 'JSON required.' }, 415);
  const body = req.method === 'GET' ? Object.fromEntries(req.nextUrl.searchParams) : await req.json().catch(() => ({}));
  const access = controllerAccess(req, body);
  if (!access.ok) return json({ error: access.error }, access.status);
  try {
    if (req.method === 'GET') return json(await getGameDiscordConnection(access.channel, access.game.id));
    if (req.method === 'DELETE') return json(await removeGameDiscordConnection(access.channel, access.game.id));
    return json(await saveGameDiscordConnection(access.channel, access.game.id, body.webhookUrl));
  } catch (error) {
    return json({ error: error instanceof GameDiscordError ? error.message : 'Could not update the Discord connection. Please retry.' }, error instanceof GameDiscordError ? error.status : 503);
  }
}
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
