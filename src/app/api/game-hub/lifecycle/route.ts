import { advanceQueuedMosaics } from '@/lib/nebula-mosaic-runner';
import { after, NextRequest, NextResponse } from 'next/server';
import { isBotRequest } from '@/lib/auth';
import { advanceWordChainRound, getGameHubStore, resolveChannelGameIds, stopInactiveChannelGames } from '@/lib/game-hub-state';
import { updateAppStateIfChanged } from '@/lib/volume-store';
import { syncGameDiscordConnections } from '@/lib/game-discord-connections';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  if (!isBotRequest(req)) return NextResponse.json({ error: 'Bot authentication required.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const acknowledged = new Set(Array.isArray(body.acknowledgedResults) ? body.acknowledgedResults.filter((id: unknown) => typeof id === 'string').slice(0, 200) : []);
  const result = await updateAppStateIfChanged(state => {
    const store = getGameHubStore(state);
    const before = JSON.stringify(store);
    const now = Date.now();
    const channels = Object.keys(store.channels);
    const stopped = body.ackOnly ? [] : channels.flatMap(channel => stopInactiveChannelGames(state, channel, now).map(gameId => ({ channel, gameId })));
    if (!body.ackOnly) for (const channel of channels) {
      if (resolveChannelGameIds(state, channel).includes('wordchain')) advanceWordChainRound(state, channel, now);
    }
    const wordChainResults = Object.values(store.channels).flatMap(settings => {
      if (!settings.pendingWordChainResults?.length) return [];
      settings.pendingWordChainResults = settings.pendingWordChainResults.filter(event =>
        !acknowledged.has(event.id) && event.expiresAt > now && resolveChannelGameIds(state, event.channel).includes('wordchain'));
      return settings.pendingWordChainResults;
    }).slice(0, 50);
    return { changed: before !== JSON.stringify(store), result: { stopped, wordChainResults: body.ackOnly ? [] : wordChainResults } };
  });
  if (!body.ackOnly) after(async () => { await syncGameDiscordConnections(); await advanceQueuedMosaics(); });
  return NextResponse.json(result);
}

