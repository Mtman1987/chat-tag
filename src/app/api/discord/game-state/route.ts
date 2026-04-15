import { NextRequest, NextResponse } from 'next/server';
import { readAppState, toMillis } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-bot-secret') || req.nextUrl.searchParams.get('secret');
  if (secret !== (process.env.BOT_SECRET_KEY || '1234')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const state = await readAppState();

    // Build tag counts from history
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

    // Build full player list with computed scores
    const players = Object.values(state.tagPlayers).map((p: any) => {
      const counts = tagCounts[p.id] || { tags: 0, tagged: 0 };
      const score = counts.tags * 100 - counts.tagged * 50;
      return {
        id: p.id,
        twitchUsername: p.twitchUsername || p.username,
        avatarUrl: p.avatarUrl || '',
        score,
        tags: counts.tags,
        tagged: counts.tagged,
        isIt: Boolean(p.isIt),
        sleepingImmunity: Boolean(p.sleepingImmunity),
        offlineImmunity: Boolean(p.offlineImmunity),
        hasPass: Boolean(p.hasPass),
        lastChatAt: p.lastChatAt || 0,
        lastSeenChannel: p.lastSeenChannel || null,
      };
    });

    // Leaderboard (sorted by score desc)
    const leaderboard = [...players]
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ rank: i + 1, ...p }));

    // Current game state
    const currentIt = players.find(p => p.isIt);
    const isFreeForAll = !currentIt;

    // Recent tag history
    const recentHistory = [...state.tagHistory]
      .sort((a: any, b: any) => (toMillis(b.timestamp) || 0) - (toMillis(a.timestamp) || 0))
      .slice(0, 25)
      .map((entry: any) => {
        const taggerId = entry.taggerId || entry.from;
        const taggedId = entry.taggedId || entry.to;
        const tagger = state.tagPlayers[taggerId];
        const tagged = state.tagPlayers[taggedId];
        return {
          taggerUsername: tagger?.twitchUsername || taggerId,
          taggedUsername: tagged?.twitchUsername || taggedId,
          timestamp: toMillis(entry.timestamp),
          doublePoints: Boolean(entry.doublePoints),
          blocked: entry.blocked || null,
        };
      });

    // Bingo state
    const bingoCard = state.bingoCards.current_user || { phrases: [], covered: {} };
    const bingo = {
      phrases: bingoCard.phrases || [],
      covered: bingoCard.covered || {},
      claimedCount: Object.keys(bingoCard.covered || {}).length,
      totalSquares: (bingoCard.phrases || []).length,
    };

    return NextResponse.json({
      tag: {
        currentIt: currentIt ? { id: currentIt.id, twitchUsername: currentIt.twitchUsername } : null,
        isFreeForAll,
        lastTagTime: toMillis(state.tagGame.state.lastTagTime),
        playerCount: players.length,
      },
      players,
      leaderboard,
      recentHistory,
      bingo,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
