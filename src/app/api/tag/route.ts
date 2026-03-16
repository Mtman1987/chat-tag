import { NextRequest, NextResponse } from 'next/server';
import { isTimedImmune, makeId, readAppState, toMillis, updateAppState } from '@/lib/volume-store';

function isPlayerImmune(player: any, taggerId: string) {
  if (player.sleepingImmunity) return { immune: true, reason: 'sleeping' };
  if (player.offlineImmunity) return { immune: true, reason: 'offline' };
  if (player.noTagbackFrom === taggerId) return { immune: true, reason: 'no-tagback' };
  if (isTimedImmune(player)) return { immune: true, reason: 'timed' };
  return { immune: false };
}

export async function GET() {
  try {
    const state = await readAppState();
    let players = Object.values(state.tagPlayers);

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

    players = players.map((p: any) => {
      const counts = tagCounts[p.id] || { tags: 0, tagged: 0 };
      const score = counts.tags * 100 - counts.tagged * 50;
      return { ...p, score, tags: counts.tags, tagged: counts.tagged };
    });

    const userMap: Record<string, string> = {};
    for (const p of players as any[]) {
      userMap[p.id] = p.twitchUsername || p.id;
    }

    const history = [...state.tagHistory]
      .sort((a: any, b: any) => (toMillis(b.timestamp) || 0) - (toMillis(a.timestamp) || 0))
      .slice(0, 100)
      .map((entry: any) => {
        const taggerId = entry.taggerId || entry.from;
        const taggedId = entry.taggedId || entry.to;
        return {
          ...entry,
          taggerUsername: userMap[taggerId] || taggerId,
          taggedUsername: userMap[taggedId] || taggedId,
        };
      });

    return NextResponse.json({
      players,
      currentIt: state.tagGame.state.currentIt,
      lastTagTime: toMillis(state.tagGame.state.lastTagTime),
      history,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, userId, username, twitchUsername, avatar, targetUserId, streamerId } = body;

    if (action === 'fix-user') {
      await updateAppState((state) => {
        if (state.tagPlayers[userId]) state.tagPlayers[userId].twitchUsername = twitchUsername;
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'join') {
      const result = await updateAppState((state) => {
        if (state.tagPlayers[userId]) return { error: 'Already in game' };

        const isAnyoneIt = Object.values(state.tagPlayers).some((p: any) => p.isIt);
        state.tagPlayers[userId] = {
          id: userId,
          twitchUsername: (twitchUsername || username || userId).toLowerCase(),
          avatarUrl: avatar || '',
          score: 0,
          tags: 0,
          tagged: 0,
          isIt: !isAnyoneIt,
          isActive: false,
          isPlayer: true,
        };
        return { success: true };
      });

      if ((result as any).error) {
        return NextResponse.json({ error: (result as any).error }, { status: 400 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'leave') {
      await updateAppState((state) => {
        delete state.tagPlayers[userId];
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'pin-tag') {
      const result = await updateAppState((state) => {
        const counts = state.pinTags.pinscorpion6521.counts;
        counts[targetUserId] = (counts[targetUserId] || 0) + 1;
        return counts[targetUserId];
      });

      return NextResponse.json({ success: true, count: result });
    }

    if (action === 'tag') {
      const result = await updateAppState((state) => {
        const tagger = state.tagPlayers[userId];
        const target = state.tagPlayers[targetUserId];
        if (!tagger || !target) return { status: 404, error: 'Player not found' };

        const players = Object.values(state.tagPlayers) as any[];
        const anyoneIt = players.some((p) => p.isIt);

        if (anyoneIt && !tagger.isIt) return { status: 400, error: 'You are not it!' };

        const immuneCheck = isPlayerImmune(target, userId);
        if (immuneCheck.immune) {
          state.tagHistory.push({
            id: makeId('hist'),
            taggerId: userId,
            taggedId: targetUserId,
            streamerId,
            timestamp: Date.now(),
            blocked: immuneCheck.reason,
          });

          let errorMsg = 'Target is immune';
          if (immuneCheck.reason === 'offline') errorMsg = `${target.twitchUsername || 'Target'} is away/offline`;
          if (immuneCheck.reason === 'sleeping') errorMsg = `${target.twitchUsername || 'Target'} is immune (sleeping)`;
          if (immuneCheck.reason === 'no-tagback') errorMsg = `${target.twitchUsername || 'Target'} is immune (no-tagback)`;
          if (immuneCheck.reason === 'timed') errorMsg = `${target.twitchUsername || 'Target'} is immune (20-min cooldown)`;

          return { status: 400, error: errorMsg };
        }

        const doublePoints = !anyoneIt;
        state.tagHistory.push({
          id: makeId('hist'),
          taggerId: userId,
          taggedId: targetUserId,
          streamerId,
          timestamp: Date.now(),
          doublePoints,
        });

        state.chatTags.push({
          id: makeId('tag'),
          taggerId: userId,
          taggedId: targetUserId,
          streamerId,
          timestamp: Date.now(),
          doublePoints,
        });

        state.tagGame.state.currentIt = targetUserId;
        state.tagGame.state.lastTagTime = Date.now();

        tagger.score = (tagger.score || 0) + (doublePoints ? 200 : 100);
        tagger.tags = (tagger.tags || 0) + 1;
        tagger.isIt = false;
        tagger.timedImmunityUntil = Date.now() + 20 * 60 * 1000;
        tagger.lastTaggedInStreamId = null;

        target.score = (target.score || 0) - 50;
        target.tagged = (target.tagged || 0) + 1;
        target.isIt = true;
        target.noTagbackFrom = userId;
        target.lastTaggedInStreamId = streamerId;

        return { success: true, doublePoints };
      });

      if ((result as any).error) {
        return NextResponse.json({ error: (result as any).error }, { status: (result as any).status || 400 });
      }

      return NextResponse.json(result);
    }

    if (action === 'sleep') {
      await updateAppState((state) => {
        if (state.tagPlayers[userId]) state.tagPlayers[userId].sleepingImmunity = true;
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'wake') {
      await updateAppState((state) => {
        if (state.tagPlayers[userId]) state.tagPlayers[userId].sleepingImmunity = false;
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'clear-away') {
      await updateAppState((state) => {
        const player = state.tagPlayers[userId];
        if (!player) return;
        player.offlineImmunity = false;
        player.sleepingImmunity = false;
        player.timedImmunityUntil = null;
        player.noTagbackFrom = null;
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'clear-all-away') {
      await updateAppState((state) => {
        for (const player of Object.values(state.tagPlayers) as any[]) {
          player.offlineImmunity = false;
          player.sleepingImmunity = false;
          player.timedImmunityUntil = null;
          player.noTagbackFrom = null;
        }
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'auto-rotate') {
      await updateAppState((state) => {
        const currentIt = Object.values(state.tagPlayers).find((p: any) => p.isIt) as any;
        if (currentIt) {
          currentIt.isIt = false;
          currentIt.offlineImmunity = true;
        }
        state.tagGame.state.currentIt = null;
        state.tagGame.state.lastTagTime = Date.now();
        state.chatTags.push({
          id: makeId('tag'),
          taggerId: 'system',
          taggedId: 'free-for-all',
          streamerId: 'auto-timeout',
          timestamp: Date.now(),
          doublePoints: true,
        });
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'set-it') {
      await updateAppState((state) => {
        for (const p of Object.values(state.tagPlayers) as any[]) {
          p.isIt = false;
        }

        const target = state.tagPlayers[userId];
        if (target) {
          target.isIt = true;
          target.sleepingImmunity = false;
          target.offlineImmunity = false;
          target.noTagbackFrom = null;
          target.timedImmunityUntil = null;
        }

        state.tagGame.state.currentIt = userId;
        state.tagGame.state.lastTagTime = Date.now();
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}