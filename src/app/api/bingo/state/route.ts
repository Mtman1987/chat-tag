import { NextRequest, NextResponse } from 'next/server';
import { makeId, readAppState, toMillis, updateAppState } from '@/lib/volume-store';

const DSH_URL = process.env.DSH_URL || 'https://discord-stream-hub-new.fly.dev';

async function refreshDSHEmbed() {
  try {
    const state = await readAppState();
    const tagCounts: Record<string, { tags: number; tagged: number }> = {};
    for (const entry of state.tagHistory) {
      if (entry.blocked) continue;
      const from = entry.taggerId || entry.from;
      const to = entry.taggedId || entry.to;
      if (from && from !== 'system') { if (!tagCounts[from]) tagCounts[from] = { tags: 0, tagged: 0 }; tagCounts[from].tags += 1; }
      if (to && to !== 'system' && to !== 'free-for-all') { if (!tagCounts[to]) tagCounts[to] = { tags: 0, tagged: 0 }; tagCounts[to].tagged += 1; }
    }
    const players = Object.values(state.tagPlayers).map((p: any) => {
      const c = tagCounts[p.id] || { tags: 0, tagged: 0 };
      return { id: p.id, twitchUsername: p.twitchUsername || p.username, score: c.tags * 100 - c.tagged * 50, tags: c.tags, tagged: c.tagged, isIt: Boolean(p.isIt), sleepingImmunity: Boolean(p.sleepingImmunity), offlineImmunity: Boolean(p.offlineImmunity), hasPass: Boolean(p.hasPass) };
    });
    const leaderboard = [...players].sort((a, b) => b.score - a.score).map((p, i) => ({ rank: i + 1, ...p }));
    const currentIt = players.find(p => p.isIt);
    const recentHistory = [...state.tagHistory].sort((a: any, b: any) => (toMillis(b.timestamp) || 0) - (toMillis(a.timestamp) || 0)).slice(0, 25).map((e: any) => {
      const tr = state.tagPlayers[e.taggerId || e.from]; const td = state.tagPlayers[e.taggedId || e.to];
      return { taggerUsername: tr?.twitchUsername || e.taggerId || e.from, taggedUsername: td?.twitchUsername || e.taggedId || e.to, timestamp: toMillis(e.timestamp), doublePoints: Boolean(e.doublePoints), blocked: e.blocked || null };
    });
    const bc = state.bingoCards.current_user || { phrases: [], covered: {} };
    const bingo = { phrases: bc.phrases || [], covered: bc.covered || {}, claimedCount: Object.keys(bc.covered || {}).length, totalSquares: (bc.phrases || []).length };
    const gameState = { tag: { currentIt: currentIt ? { id: currentIt.id, twitchUsername: currentIt.twitchUsername } : null, isFreeForAll: !currentIt, lastTagTime: toMillis(state.tagGame.state.lastTagTime), playerCount: players.length }, players, leaderboard, recentHistory, bingo, timestamp: Date.now() };
    await fetch(`${DSH_URL}/api/chat-tag/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameState }) });
  } catch (e: any) { console.error('[Bingo] DSH refresh error:', e.message); }
}

export async function GET() {
  try {
    const state = await readAppState();
    const card = state.bingoCards.current_user;

    if (!card) {
      return NextResponse.json({ bingo: { phrases: [], covered: {} } });
    }

    return NextResponse.json({ bingo: card });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function checkBingo(covered: Record<string, any>, username: string): boolean {
  const userSquares = Object.keys(covered)
    .filter((key) => covered[key]?.username === username)
    .map((key) => parseInt(key, 10));

  for (let row = 0; row < 5; row += 1) {
    const rowSquares = [row * 5, row * 5 + 1, row * 5 + 2, row * 5 + 3, row * 5 + 4];
    if (rowSquares.every((s) => userSquares.includes(s))) return true;
  }

  for (let col = 0; col < 5; col += 1) {
    const colSquares = [col, col + 5, col + 10, col + 15, col + 20];
    if (colSquares.every((s) => userSquares.includes(s))) return true;
  }

  const diag1 = [0, 6, 12, 18, 24];
  const diag2 = [4, 8, 12, 16, 20];
  if (diag1.every((s) => userSquares.includes(s))) return true;
  if (diag2.every((s) => userSquares.includes(s))) return true;

  return false;
}

export async function POST(req: NextRequest) {
  try {
    const { action, squareIndex, userId, username, avatar, streamerChannel, phrases } = await req.json();

    if (action === 'claim') {
      // CRITICAL FIX: Validate squareIndex before processing
      if (!Number.isInteger(squareIndex) || squareIndex < 0 || squareIndex > 24) {
        return NextResponse.json(
          { error: `Invalid square index: ${squareIndex}. Must be between 0 and 24.` },
          { status: 400 }
        );
      }

      // Validate other required fields
      if (!userId && !username) {
        return NextResponse.json({ error: 'userId or username is required' }, { status: 400 });
      }

      const result = await updateAppState((state) => {
        const card = state.bingoCards.current_user || { phrases: [], covered: {} };

        if (card.covered?.[squareIndex]) {
          return { status: 400, error: 'Square already claimed' };
        }

        const covered = { ...(card.covered || {}) };
        covered[squareIndex] = { userId: userId || username, username: username || userId, avatar, streamerChannel };
        state.bingoCards.current_user = { ...card, covered, updatedAt: new Date().toISOString() };

        const hasBingo = checkBingo(covered, username || userId);
        if (hasBingo) {
          const player = state.tagPlayers?.[username || userId];
          if (player) {
            player.score = (player.score || 0) + 100;
            player.bingoWins = (player.bingoWins || 0) + 1;
          }
          state.bingoEvents = state.bingoEvents || [];
          state.bingoEvents.push({
            id: makeId('bingo'),
            userId: userId || username,
            points: 100,
            timestamp: Date.now(),
          });
        }

        return { success: true, bingo: hasBingo };
      });

      if ((result as any).error) {
        return NextResponse.json({ error: (result as any).error }, { status: (result as any).status || 400 });
      }

      refreshDSHEmbed().catch(() => {});
      return NextResponse.json(result);
    }

    if (action === 'reset') {
      await updateAppState((state) => {
        state.bingoCards.current_user = {
          phrases,
          covered: {},
          updatedAt: new Date().toISOString(),
        };
      });

      refreshDSHEmbed().catch(() => {});
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}