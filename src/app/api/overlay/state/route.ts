import { NextRequest, NextResponse } from 'next/server';
import { readAppState, toMillis } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const state = await readAppState();

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
      score: c.tags * 100 - c.tagged * 50 + (p.score || 0),
      tags: c.tags,
      tagged: c.tagged,
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

  return NextResponse.json({
    me: me || null,
    myRank,
    it: itPlayer ? { id: itPlayer.id, username: itPlayer.twitchUsername } : null,
    isFFA: !itPlayer,
    lastTagTime: toMillis(state.tagGame.state.lastTagTime),
    playerCount: players.length,
    leaderboard,
    recentHistory,
    overlayMessages,
    monthlyWinners,
    timestamp: Date.now(),
  });
}
