import { NextRequest, NextResponse } from 'next/server';
import { readAppState, toMillis } from '@/lib/volume-store';
import { getScoringSettings, scoreFromTagCounts } from '@/lib/scoring';
import { fetchTwitchLiveData } from '@/lib/twitch-live-data';
import { getGameHubGameStats, normalizeGameHubChannel, resolveChannelGameIds } from '@/lib/game-hub-state';
import { mosaicPublicSnapshot } from '@/lib/nebula-mosaic';
import { chatWarsPublicSnapshot } from '@/lib/chat-wars';
import { getNebulaChatEvents } from '@/lib/game-hub-event-bus';
import { nebulaRotationIndexAt } from '@/lib/nebula-rotation';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const state = await readAppState();
  const scoring = getScoringSettings(state);

  const tagCounts: Record<string, { tags: number; tagged: number }> = {};
  for (const entry of state.tagHistory) {
    if (entry.blocked) continue;
    const from = entry.taggerId || entry.from;
    const to = entry.taggedId || entry.to;
    if (from && from !== 'system') {
      if (!tagCounts[from]) tagCounts[from] = { tags: 0, tagged: 0 };
      tagCounts[from].tags += 1;
    }
    if (to && to !== 'system' && to !== 'free-for-all') {
      if (!tagCounts[to]) tagCounts[to] = { tags: 0, tagged: 0 };
      tagCounts[to].tagged += 1;
    }
  }

  const players = Object.values(state.tagPlayers).map((p: any) => {
    const c = tagCounts[p.id] || { tags: 0, tagged: 0 };
    return {
      id: p.id,
      twitchUsername: p.twitchUsername || p.username,
      avatarUrl: p.avatarUrl || '',
      score: scoreFromTagCounts(c, scoring) + (p.bingoPoints || 0),
      tags: c.tags,
      tagged: c.tagged,
      bingoPoints: p.bingoPoints || 0,
      wins: p.wins || 0,
      isIt: Boolean(p.isIt),
      sleepingImmunity: Boolean(p.sleepingImmunity),
      offlineImmunity: Boolean(p.offlineImmunity),
      hasPass: (p.passCount || 0) > 0,
      passCount: p.passCount || 0,
    };
  });

  const me = players.find(p => p.id === userId);
  const itPlayer = players.find(p => p.isIt);
  const leaderboard = [...players].sort((a, b) => b.score - a.score).slice(0, 10);
  const myRank = me ? [...players].sort((a, b) => b.score - a.score).findIndex(p => p.id === userId) + 1 : null;

  const recentHistory = [...state.tagHistory]
    .sort((a: any, b: any) => (toMillis(b.timestamp) || 0) - (toMillis(a.timestamp) || 0))
    .slice(0, 10)
    .map((e: any) => {
      const tr = state.tagPlayers[e.taggerId || e.from];
      const td = state.tagPlayers[e.taggedId || e.to];
      return {
        tagger: tr?.twitchUsername || e.taggerId || e.from,
        tagged: td?.twitchUsername || e.taggedId || e.to,
        timestamp: toMillis(e.timestamp),
        doublePoints: Boolean(e.doublePoints),
        blocked: e.blocked || null,
      };
    });

  const monthlyWinners = state.tagGame.state.monthlyWinners || [];
  const overlayMessages = (state.overlayMessages?.[userId] || [])
    .slice()
    .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 10);
  const overlayOwner = state.tagPlayers?.[userId] || state.users?.[userId] || {};
  const overlayChannel = normalizeGameHubChannel(
    overlayOwner.twitchUsername || overlayOwner.username || String(userId).replace(/^user_/, ''),
  );
  const mosaic = overlayChannel ? mosaicPublicSnapshot(state, overlayChannel) : { artwork: null };
  const chatWars = overlayChannel ? chatWarsPublicSnapshot(state, overlayChannel) : null;
  const activityOrder = ['chatwars', 'pixelbattle', 'treasurehunt', 'bingo'];
  const activeGames = new Set(overlayChannel ? resolveChannelGameIds(state, overlayChannel) : []);
  const now = Date.now();
  const recentGames = new Set(overlayChannel ? getNebulaChatEvents(overlayChannel, '', 250).flatMap((event: any) => {
    const at = Date.parse(String(event?.at || ''));
    return Number.isFinite(at) && now - at <= 30 * 60_000 && Array.isArray(event?.gameIds) ? event.gameIds : [];
  }) : []);
  const rotatingGames = activityOrder.filter((gameId) => activeGames.has(gameId)
    && (recentGames.has(gameId) || (gameId === 'pixelbattle' && mosaic.artwork?.status === 'active')));
  const activeGridGame = rotatingGames.length ? rotatingGames[nebulaRotationIndexAt(now, rotatingGames.length)] : null;
  const activeGridLeaderboard = activeGridGame === 'pixelbattle' && mosaic.artwork?.status === 'active'
    ? {
      gameId: 'pixelbattle',
      gameName: 'Nebula Mosaic',
      theme: mosaic.artwork.theme,
      rows: getGameHubGameStats(state, 'pixelbattle').leaderboard.slice(0, 5).map((entry, index) => ({
        rank: index + 1,
        username: entry.displayName || entry.username,
        score: entry.score,
      })),
    }
    : activeGridGame === 'chatwars' && chatWars
      ? {
        gameId: 'chatwars',
        gameName: 'Chat Wars',
        theme: '',
        rows: chatWars.leaderboard.slice(0, 5).map((entry, index) => ({
          rank: index + 1,
          username: `${entry.username} · ${entry.team} L${entry.level}`,
          score: entry.score,
        })),
      }
      : null;
  const trackedChannels = Object.keys(state.botChannels || {});
  let liveCount = 0;
  let liveUsers: any[] = [];

  if (trackedChannels.length > 0) {
    try {
      const liveData = await fetchTwitchLiveData(trackedChannels);
      liveCount = Array.isArray(liveData?.liveUsers) ? liveData.liveUsers.length : 0;
      liveUsers = Array.isArray(liveData?.liveUsers) ? liveData.liveUsers.slice(0, 12) : [];
    } catch {}
  }

  return NextResponse.json({
    me: me || null,
    myRank,
    it: itPlayer ? { id: itPlayer.id, username: itPlayer.twitchUsername } : null,
    isFFA: !itPlayer,
    lastTagTime: toMillis(state.tagGame.state.lastTagTime),
    liveCount,
    liveUsers,
    playerCount: players.length,
    leaderboard,
    recentHistory,
    overlayMessages,
    activeGridLeaderboard,
    monthlyWinners,
    timestamp: Date.now(),
  });
}
