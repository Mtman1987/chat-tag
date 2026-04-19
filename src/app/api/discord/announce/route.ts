import { NextRequest, NextResponse } from 'next/server';
import { readAppState, toMillis } from '@/lib/volume-store';

const DSH_URL = process.env.DSH_URL || 'https://discord-stream-hub-new.fly.dev';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

function buildGameStatePayload(state: any) {
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
    const counts = tagCounts[p.id] || { tags: 0, tagged: 0 };
    const score = counts.tags * 100 - counts.tagged * 50;
    return {
      id: p.id,
      twitchUsername: p.twitchUsername || p.username,
      score,
      tags: counts.tags,
      tagged: counts.tagged,
      isIt: Boolean(p.isIt),
      sleepingImmunity: Boolean(p.sleepingImmunity),
      offlineImmunity: Boolean(p.offlineImmunity),
      hasPass: Boolean(p.hasPass),
    };
  });

  const leaderboard = [...players]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ rank: i + 1, ...p }));

  const currentIt = players.find(p => p.isIt);

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

  const bingoCard = state.bingoCards.current_user || { phrases: [], covered: {} };
  const bingo = {
    phrases: bingoCard.phrases || [],
    covered: bingoCard.covered || {},
    claimedCount: Object.keys(bingoCard.covered || {}).length,
    totalSquares: (bingoCard.phrases || []).length,
  };

  return {
    tag: {
      currentIt: currentIt ? { id: currentIt.id, twitchUsername: currentIt.twitchUsername } : null,
      isFreeForAll: !currentIt,
      lastTagTime: toMillis(state.tagGame.state.lastTagTime),
      playerCount: players.length,
    },
    players,
    leaderboard,
    recentHistory,
    bingo,
    timestamp: Date.now(),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tagger, tagged, doublePoints, message } = body;

    const state = await readAppState();
    const gameState = buildGameStatePayload(state);

    // 1. Refresh the DSH persistent embed
    try {
      const dshRes = await fetch(`${DSH_URL}/api/chat-tag/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameState }),
      });
      if (dshRes.ok) {
        console.log('[Announce] DSH embed updated');
      } else {
        console.error('[Announce] DSH refresh failed:', dshRes.status);
      }
    } catch (e: any) {
      console.error('[Announce] DSH refresh error:', e.message);
    }

    // 2. Post a confirmation message to the Discord webhook
    if (DISCORD_WEBHOOK_URL && tagger && tagged) {
      try {
        const icon = doublePoints ? '🔥' : '🎯';
        const pointsNote = doublePoints ? ' for **DOUBLE POINTS**' : '';
        const extraNote = message ? ` (${message})` : '';
        const newIt = gameState.tag.currentIt?.twitchUsername || 'Free for all';

        await fetch(DISCORD_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [{
              title: `${icon} Tag Event!`,
              description: `**${tagger}** tagged **${tagged}**${pointsNote}!${extraNote}`,
              color: doublePoints ? 0xFF4500 : 0x00D9FF,
              fields: [
                { name: 'Now IT', value: newIt, inline: true },
                { name: 'Players', value: `${gameState.tag.playerCount}`, inline: true },
              ],
              timestamp: new Date().toISOString(),
              footer: { text: 'SPMT Chat Tag' },
            }],
          }),
        });
        console.log('[Announce] Discord webhook message sent');
      } catch (e: any) {
        console.error('[Announce] Discord webhook error:', e.message);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
