import { NextRequest, NextResponse } from 'next/server';
import { isTimedImmune, makeId, readAppState, toMillis, updateAppState } from '@/lib/volume-store';
import { lookupTwitchUser } from '@/lib/twitch';

export const dynamic = 'force-dynamic';

// Type definitions for player objects
interface TagPlayer {
  id?: string;
  twitchUsername?: string;
  isIt?: boolean;
  sleepingImmunity?: boolean;
  offlineImmunity?: boolean;
  noTagbackFrom?: string | null;
  timedImmunityUntil?: number | null;
  [key: string]: any;
}

// Migrate manual_ players to their real user_ ID when they show up in chat
function migrateManualPlayer(state: any, realUserId: string, username: string): void {
  if (!realUserId?.startsWith('user_') || !username) return;
  if (state.tagPlayers?.[realUserId]) return; // already correct

  const manualKey = `manual_${username.toLowerCase()}`;
  const manualPlayer = state.tagPlayers?.[manualKey];
  if (!manualPlayer) return;

  // Move player data to real ID
  console.log(`[Migration] Migrating ${manualKey} -> ${realUserId} (${username})`);
  manualPlayer.id = realUserId;
  state.tagPlayers[realUserId] = manualPlayer;
  delete state.tagPlayers[manualKey];

  // Fix currentIt reference
  if (state.tagGame?.state?.currentIt === manualKey) {
    state.tagGame.state.currentIt = realUserId;
  }

  // Fix noTagbackFrom references
  for (const p of Object.values(state.tagPlayers) as TagPlayer[]) {
    if (p?.noTagbackFrom === manualKey) p.noTagbackFrom = realUserId;
  }
}

function isPlayerImmune(player: TagPlayer | undefined, taggerId: string): { immune: boolean; reason?: string } {
  if (!player) return { immune: true, reason: 'player-not-found' };
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
      return { ...p, score, tags: counts.tags, tagged: counts.tagged, lastChatAt: p.lastChatAt || 0, lastSeenChannel: p.lastSeenChannel || null, hasPass: (p.passCount || (p.hasPass ? 1 : 0)) > 0, passCount: p.passCount || (p.hasPass ? 1 : 0), passGrantedAt: p.passGrantedAt || 0, overlayMode: Boolean(p.overlayMode), wins: p.wins || 0 };
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

    const adminHistory = [...(state.adminHistory || [])]
      .sort((a: any, b: any) => (toMillis(b.timestamp) || 0) - (toMillis(a.timestamp) || 0))
      .slice(0, 100);

    // Derive currentIt from player isIt flag as source of truth
    const itPlayer = (players as any[]).find((p: any) => p.isIt);
    const currentIt = itPlayer?.id || state.tagGame.state.currentIt || null;
    const lastTagTime = toMillis(state.tagGame.state.lastTagTime);

    // Auto-heal: sync tagGame.state if it drifted from player flags
    if (itPlayer && state.tagGame.state.currentIt !== itPlayer.id) {
      state.tagGame.state.currentIt = itPlayer.id;
      // Fire-and-forget write to fix the drift
      updateAppState((s) => {
        s.tagGame.state.currentIt = itPlayer.id;
      }).catch(() => {});
    }

    const monthlyWinners = state.tagGame.state.monthlyWinners || [];

    return NextResponse.json({
      players,
      currentIt,
      lastTagTime,
      history,
      adminHistory,
      monthlyWinners,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, userId, username, twitchUsername, avatar, targetUserId, streamerId, performedBy } = body;

    if (action === 'chat-activity') {
      await updateAppState((state) => {
        // Migrate manual_ player to real user_ ID on first chat
        if (twitchUsername) migrateManualPlayer(state, userId, twitchUsername);

        const player = state.tagPlayers[userId];
        if (!player) return;
        
        player.lastChatAt = Date.now();
        if (body.channel) player.lastSeenChannel = body.channel;
        
        if (player.sleepingImmunity || player.offlineImmunity) {
          player.sleepingImmunity = false;
          player.offlineImmunity = false;
        }
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'grant-pass') {
      const MAX_PASSES = 3;
      const result = await updateAppState((state) => {
        const player = state.tagPlayers[userId];
        if (!player) return { granted: false, reason: 'not-a-player' };
        
        // Migrate old boolean hasPass to passCount
        if (player.passCount === undefined) {
          player.passCount = player.hasPass ? 1 : 0;
        }
        
        if (player.passCount >= MAX_PASSES) {
          return { granted: false, reason: 'max-passes', passCount: player.passCount };
        }
        
        player.passCount = (player.passCount || 0) + 1;
        player.hasPass = true;
        player.passGrantedAt = Date.now();
        player.passReason = body.reason || 'unknown';
        return { granted: true, passCount: player.passCount };
      });
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'use-pass') {
      const result = await updateAppState((state) => {
        const tagger = state.tagPlayers[userId];
        const target = state.tagPlayers[targetUserId];
        if (!tagger) return { status: 404, error: 'You are not in the game!' };
        if (!target) return { status: 404, error: 'Target not in the game!' };
        // Migrate old boolean hasPass to passCount
        if (tagger.passCount === undefined) {
          tagger.passCount = tagger.hasPass ? 1 : 0;
        }
        if (tagger.passCount <= 0) return { status: 400, error: 'You don\'t have a pass! Earn one by gifting a sub, cheering 100+ bits, or joining a hype train.' };
        if (userId === targetUserId) return { status: 400, error: 'You can\'t pass to yourself!' };
        
        const immuneCheck = isPlayerImmune(target, userId);
        if (immuneCheck.immune) {
          let errorMsg = 'Target is immune';
          if (immuneCheck.reason === 'sleeping') errorMsg = `${target.twitchUsername || 'Target'} is immune (sleeping)`;
          if (immuneCheck.reason === 'offline') errorMsg = `${target.twitchUsername || 'Target'} is away/offline`;
          if (immuneCheck.reason === 'no-tagback') errorMsg = `${target.twitchUsername || 'Target'} is immune (no-tagback)`;
          if (immuneCheck.reason === 'timed') errorMsg = `${target.twitchUsername || 'Target'} is immune (20-min cooldown)`;
          return { status: 400, error: errorMsg };
        }
        
        // Use the pass — always double points
        tagger.passCount = (tagger.passCount || 1) - 1;
        tagger.hasPass = tagger.passCount > 0;
        tagger.passUsedAt = Date.now();
        
        // Record in history
        state.tagHistory.push({
          id: makeId('hist'),
          taggerId: userId,
          taggedId: targetUserId,
          streamerId,
          timestamp: Date.now(),
          doublePoints: true,
          passUsed: true,
        });
        state.chatTags.push({
          id: makeId('tag'),
          taggerId: userId,
          taggedId: targetUserId,
          streamerId,
          timestamp: Date.now(),
          doublePoints: true,
          passUsed: true,
        });
        
        // Clear current it
        const currentItPlayer = Object.values(state.tagPlayers).find((p: any) => p.isIt) as any;
        if (currentItPlayer) {
          currentItPlayer.isIt = false;
        }
        
        // Set target as it
        state.tagGame.state.currentIt = targetUserId;
        state.tagGame.state.lastTagTime = Date.now();
        
        tagger.score = (tagger.score || 0) + 200; // always double
        tagger.tags = (tagger.tags || 0) + 1;
        tagger.isIt = false;
        tagger.timedImmunityUntil = Date.now() + 20 * 60 * 1000;
        
        target.score = (target.score || 0) - 50;
        target.tagged = (target.tagged || 0) + 1;
        target.isIt = true;
        target.noTagbackFrom = userId;
        target.lastTaggedInStreamId = streamerId;
        
        return { success: true, doublePoints: true };
      });
      
      if ((result as any).error) {
        return NextResponse.json({ error: (result as any).error }, { status: (result as any).status || 400 });
      }
      return NextResponse.json(result);
    }

    if (action === 'fix-user') {
      await updateAppState((state) => {
        if (state.tagPlayers[userId]) state.tagPlayers[userId].twitchUsername = twitchUsername;
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'join') {
      const normalizedUsername = (twitchUsername || username || userId).toLowerCase();

      // Auto-fetch avatar from Twitch if not provided
      let resolvedAvatar = avatar || '';
      if (!resolvedAvatar) {
        try {
          const twitchUser = await lookupTwitchUser(normalizedUsername);
          if (twitchUser) resolvedAvatar = twitchUser.profile_image_url;
        } catch {}
      }

      const result = await updateAppState((state) => {
        if (state.tagPlayers[userId]) return { error: 'Already in game' };

        const isAnyoneIt = Object.values(state.tagPlayers).some((p: any) => p.isIt);
        state.tagPlayers[userId] = {
          id: userId,
          twitchUsername: normalizedUsername,
          avatarUrl: resolvedAvatar,
          score: 0,
          tags: 0,
          tagged: 0,
          isIt: !isAnyoneIt,
          isActive: false,
          isPlayer: true,
        };

        if (normalizedUsername) {
          state.botChannels[normalizedUsername] = {
            ...(state.botChannels[normalizedUsername] || {}),
            name: normalizedUsername,
            status: 'joined',
            lastUpdated: new Date().toISOString(),
          };
        }

        state.adminHistory.push({
          id: makeId('admin'), action: 'join', performedBy: performedBy || normalizedUsername,
          details: `${normalizedUsername} joined the game`, timestamp: Date.now(),
        });

        return { success: true };
      });

      if ((result as any).error) {
        return NextResponse.json({ error: (result as any).error }, { status: 400 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'leave') {
      await updateAppState((state) => {
        const player = state.tagPlayers[userId];
        if (!player) return;
        const playerName = player.twitchUsername || userId;
        const wasIt = player.isIt || state.tagGame?.state?.currentIt === userId;

        // Remove bot channel entry for this player
        if (playerName) {
          delete state.botChannels[playerName.toLowerCase()];
        }

        delete state.tagPlayers[userId];

        // If the leaving player was "it", clear currentIt and go free-for-all
        if (wasIt && state.tagGame?.state) {
          state.tagGame.state.currentIt = null;
          state.tagGame.state.lastTagTime = Date.now();

          state.tagHistory = state.tagHistory || [];
          state.tagHistory.push({
            id: makeId('hist'),
            taggerId: 'system',
            taggedId: 'free-for-all',
            streamerId: 'player-left',
            timestamp: Date.now(),
            doublePoints: true,
          });
        }

        state.adminHistory = state.adminHistory || [];
        state.adminHistory.push({
          id: makeId('admin'), action: 'leave', performedBy: performedBy || playerName,
          details: `${playerName} left the game${wasIt ? ' (was it — now free-for-all)' : ''}`, timestamp: Date.now(),
        });
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
        // Migrate manual_ IDs to real user_ IDs if needed
        if (twitchUsername) migrateManualPlayer(state, userId, twitchUsername);

        const tagger: TagPlayer | undefined = state.tagPlayers?.[userId];
        const target: TagPlayer | undefined = state.tagPlayers?.[targetUserId];
        
        // Enhanced validation with better error messages
        if (!tagger) {
          const playerIds = Object.keys(state.tagPlayers || {}).slice(0, 5).join(', ');
          return { status: 404, error: `Tagger not found. Your ID: ${userId}. (Available: ${playerIds}...)` };
        }
        if (!target) {
          return { status: 404, error: `Target player not found. ID: ${targetUserId}` };
        }

        const playersForItCheck = Object.values(state.tagPlayers || {}) as TagPlayer[];
        const whoIsIt = playersForItCheck.find((p) => p?.isIt);
        const anyoneIt = !!whoIsIt;

        // Only check if tagger is "it" if someone is it
        if (anyoneIt && !tagger.isIt) {
          return { status: 400, error: `You are not it! ${whoIsIt?.twitchUsername || whoIsIt?.id || 'Unknown'} is it.` };
        }

        const immuneCheck = isPlayerImmune(target, userId);
        if (immuneCheck.immune) {
          state.tagHistory = state.tagHistory || [];
          state.tagHistory.push({
            id: makeId('hist'),
            taggerId: userId,
            taggedId: targetUserId,
            streamerId,
            timestamp: Date.now(),
            blocked: immuneCheck.reason,
          });

          let errorMsg = 'Target is immune';
          if (immuneCheck.reason === 'player-not-found') errorMsg = 'Target player not found';
          if (immuneCheck.reason === 'offline') errorMsg = `${target.twitchUsername || 'Target'} is away/offline`;
          if (immuneCheck.reason === 'sleeping') errorMsg = `${target.twitchUsername || 'Target'} is immune (sleeping)`;
          if (immuneCheck.reason === 'no-tagback') errorMsg = `${target.twitchUsername || 'Target'} is immune (no-tagback)`;
          if (immuneCheck.reason === 'timed') errorMsg = `${target.twitchUsername || 'Target'} is immune (20-min cooldown)`;

          return { status: 400, error: errorMsg };
        }

        // Ensure state collections exist
        state.tagHistory = state.tagHistory || [];
        state.chatTags = state.chatTags || [];

        // Check if double points (no one currently "it" before this tag)
        const playersForDoubleCheck = Object.values(state.tagPlayers || {}) as TagPlayer[];
        const anyoneItNow = playersForDoubleCheck.some((p) => p?.isIt);
        const doublePoints = !anyoneItNow;

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

        // Update game state
        if (state.tagGame?.state) {
          state.tagGame.state.currentIt = targetUserId;
          state.tagGame.state.lastTagTime = Date.now();
        }

        // Update tagger (now no longer "it")
        tagger.score = (tagger.score || 0) + (doublePoints ? 200 : 100);
        tagger.tags = (tagger.tags || 0) + 1;
        tagger.isIt = false;
        tagger.timedImmunityUntil = Date.now() + 20 * 60 * 1000;
        tagger.lastTaggedInStreamId = null;

        // Update target (now "it")
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
        const player = state.tagPlayers?.[userId];
        if (!player) return { error: 'Player not found' };
        
        player.sleepingImmunity = true;
        state.adminHistory = state.adminHistory || [];
        state.adminHistory.push({
          id: makeId('admin'),
          action: 'sleep',
          performedBy: performedBy || 'unknown',
          targetUser: player.twitchUsername || userId,
          timestamp: Date.now(),
        });
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'wake') {
      await updateAppState((state) => {
        const player = state.tagPlayers?.[userId];
        if (!player) return { error: 'Player not found' };
        
        player.sleepingImmunity = false;
        state.adminHistory = state.adminHistory || [];
        state.adminHistory.push({
          id: makeId('admin'),
          action: 'wake',
          performedBy: performedBy || 'unknown',
          targetUser: player.twitchUsername || userId,
          timestamp: Date.now(),
        });
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'clear-away') {
      await updateAppState((state) => {
        const player = state.tagPlayers?.[userId];
        if (!player) return { error: 'Player not found' };
        
        player.offlineImmunity = false;
        player.sleepingImmunity = false;
        player.timedImmunityUntil = null;
        player.noTagbackFrom = null;
        state.adminHistory = state.adminHistory || [];
        state.adminHistory.push({
          id: makeId('admin'),
          action: 'clear-away',
          performedBy: performedBy || 'unknown',
          targetUser: player.twitchUsername || userId,
          timestamp: Date.now(),
        });
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'clear-all-away') {
      await updateAppState((state) => {
        let count = 0;
        state.adminHistory = state.adminHistory || [];
        const players = Object.values(state.tagPlayers || {}) as TagPlayer[];
        
        for (const player of players) {
          if (player?.offlineImmunity || player?.sleepingImmunity || player?.timedImmunityUntil || player?.noTagbackFrom) {
            count++;
          }
          if (player) {
            player.offlineImmunity = false;
            player.sleepingImmunity = false;
            player.timedImmunityUntil = null;
            player.noTagbackFrom = null;
          }
        }
        state.adminHistory.push({
          id: makeId('admin'),
          action: 'clear-all-away',
          performedBy: performedBy || 'unknown',
          details: `Cleared immunity for ${count} players`,
          timestamp: Date.now(),
        });
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'auto-rotate') {
      await updateAppState((state) => {
        const players = Object.values(state.tagPlayers || {}) as TagPlayer[];
        const currentIt = players.find((p) => p?.isIt);
        
        if (currentIt) {
          currentIt.isIt = false;
          const lastChat = currentIt.lastChatAt || 0;
          const recentlyActive = Date.now() - lastChat < 40 * 60 * 1000;
          if (!recentlyActive) {
            currentIt.offlineImmunity = true;
          }
        }
        
        if (state.tagGame?.state) {
          state.tagGame.state.currentIt = null;
          state.tagGame.state.lastTagTime = Date.now();
        }
        
        state.chatTags = state.chatTags || [];
        state.chatTags.push({
          id: makeId('tag'),
          taggerId: 'system',
          taggedId: 'free-for-all',
          streamerId: 'auto-timeout',
          timestamp: Date.now(),
          doublePoints: true,
        });
        state.adminHistory = state.adminHistory || [];
        state.adminHistory.push({
          id: makeId('admin'),
          action: 'auto-rotate',
          performedBy: performedBy || 'system',
          details: currentIt ? `Rotated from ${currentIt.twitchUsername || 'unknown'}` : 'Free for all',
          timestamp: Date.now(),
        });
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'set-winner') {
      const place = body.place; // 1, 2, or 3
      if (![1, 2, 3].includes(place)) return NextResponse.json({ error: 'place must be 1, 2, or 3' }, { status: 400 });
      await updateAppState((state) => {
        const player = state.tagPlayers?.[userId];
        if (!player) return;
        if (!state.tagGame.state.monthlyWinners) state.tagGame.state.monthlyWinners = [];
        // Remove any existing entry for this place or this player
        state.tagGame.state.monthlyWinners = state.tagGame.state.monthlyWinners.filter(
          (w: any) => w.place !== place && w.userId !== userId
        );
        player.wins = (player.wins || 0) + 1;
        state.tagGame.state.monthlyWinners.push({
          userId,
          username: player.twitchUsername || userId,
          place,
          month: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
          setAt: Date.now(),
        });
        state.tagGame.state.monthlyWinners.sort((a: any, b: any) => a.place - b.place);
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'clear-winners') {
      await updateAppState((state) => {
        state.tagGame.state.monthlyWinners = [];
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'set-overlay') {
      const enabled = body.enabled !== false;
      await updateAppState((state) => {
        const player = state.tagPlayers?.[userId];
        if (!player) return;
        player.overlayMode = enabled;
      });
      return NextResponse.json({ success: true, overlayMode: enabled });
    }

    if (action === 'set-it') {
      await updateAppState((state) => {
        const players = Object.values(state.tagPlayers || {}) as TagPlayer[];
        
        // Clear "it" from all players
        for (const p of players) {
          if (p) p.isIt = false;
        }

        const target = state.tagPlayers?.[userId];
        if (!target) {
          return { error: 'Target player not found' };
        }
        
        target.isIt = true;
        target.sleepingImmunity = false;
        target.offlineImmunity = false;
        target.noTagbackFrom = null;
        target.timedImmunityUntil = null;

        if (state.tagGame?.state) {
          state.tagGame.state.currentIt = userId;
          state.tagGame.state.lastTagTime = Date.now();
        }

        // Record in tag history so there's always a log
        state.tagHistory = state.tagHistory || [];
        state.tagHistory.push({
          id: makeId('hist'),
          taggerId: performedBy || 'system',
          taggedId: userId,
          streamerId: 'admin-set',
          timestamp: Date.now(),
          doublePoints: false,
        });

        state.adminHistory = state.adminHistory || [];
        state.adminHistory.push({
          id: makeId('admin'),
          action: 'set-it',
          performedBy: performedBy || 'unknown',
          targetUser: target?.twitchUsername || userId,
          timestamp: Date.now(),
        });
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}