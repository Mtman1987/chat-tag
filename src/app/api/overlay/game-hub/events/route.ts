import { NextRequest, NextResponse } from 'next/server';
import { getGameHubGame } from '@/lib/game-hub-registry';
import { getNebulaChatEvents } from '@/lib/game-hub-event-bus';

export const dynamic = 'force-dynamic';

const MAX_READ_EVENTS = 100;

function normalizeChannel(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/^#/, '').slice(0, 80);
}

function publicGameIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim().toLowerCase()).filter((gameId) => Boolean(getGameHubGame(gameId))))].slice(0, 20);
}

export async function GET(req: NextRequest) {
  const channel = normalizeChannel(req.nextUrl.searchParams.get('channel'));
  if (!channel) return NextResponse.json({ error: 'channel is required.' }, { status: 400 });

  const after = String(req.nextUrl.searchParams.get('after') || '').trim();
  const events = getNebulaChatEvents(channel, after, MAX_READ_EVENTS)
    .map((item) => ({
      id: String(item?.id || ''),
      at: String(item?.at || ''),
      channel: String(item?.channel || channel),
      username: String(item?.username || ''),
      displayName: String(item?.displayName || item?.username || ''),
      message: String(item?.message || ''),
      gameIds: publicGameIds(item?.gameIds),
      color: String(item?.color || ''),
      badges: item?.badges && typeof item.badges === 'object' ? item.badges : {},
    }));

  return NextResponse.json({ channel, events, latestId: events.at(-1)?.id || after || null }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
