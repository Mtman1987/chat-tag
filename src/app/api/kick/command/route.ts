import { NextRequest, NextResponse } from 'next/server';
import { readAppState, updateAppState, makeId, isTimedImmune, toMillis } from '@/lib/volume-store';
import { lookupTwitchUser } from '@/lib/twitch';
import { getScoringSettings, scoreFromTagCounts } from '@/lib/scoring';
import { getPublicAppOrigin } from '@/lib/public-origin';

export const dynamic = 'force-dynamic';

const STREAMWEAVER_SECRET = process.env.STREAMWEAVER_SECRET || process.env.BOT_SECRET_KEY || '1234';

function isPlayerImmune(player: any, taggerId: string): { immune: boolean; reason?: string } {
  if (!player) return { immune: true, reason: 'player-not-found' };
  if (player.sleepingImmunity) return { immune: true, reason: 'sleeping' };
  if (player.offlineImmunity) return { immune: true, reason: 'offline' };
  if (player.noTagbackFrom === taggerId) return { immune: true, reason: 'no-tagback' };
  if (isTimedImmune(player)) return { immune: true, reason: 'timed' };
  return { immune: false };
}

/**
 * POST /api/kick/command
 * Receives forwarded @spmt commands from Streamweaver (Kick chat)
 * Body: { username, twitchUsername, userId, message, channel, secret }
 * Returns: { reply: "text to send back to Kick" } or { replies: ["msg1", "msg2"] } for broadcasts
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, twitchUsername, userId: rawUserId, message, channel, secret } = body;

    if (secret !== STREAMWEAVER_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!message) {
      return NextResponse.json({ error: 'No message provided' }, { status: 400 });
    }

    // Parse the spmt command
    const msg = message.trim().toLowerCase();
    const normalized = msg.startsWith('spmt ') ? msg : msg.replace(/^@spmt\s+/, '');
    const args = normalized.split(/\s+/).slice(1);
    const cmd = args[0];
    const displayName = username || twitchUsername || 'Unknown';

    // Resolve user ID — player must have linked their Kick account via "spmt kick <name>"
    // Look up by kickUsername first, then fall back to twitchUsername
    const state = await readAppState();
    let resolvedUserId = rawUserId || null;
    let resolvedTwitchUsername = twitchUsername || null;

    if (!resolvedUserId) {
      // Find player by kickUsername
      const kickName = (username || '').toLowerCase();
      const playerByKick = Object.values(state.tagPlayers || {}).find(
        (p: any) => (p.kickUsername || '').toLowerCase() === kickName
      );
      if (playerByKick) {
        resolvedUserId = (playerByKick as any).id;
        resolvedTwitchUsername = (playerByKick as any).twitchUsername;
      }
    }

    // Helper to get player
    const getPlayer = () => state.tagPlayers?.[resolvedUserId];

    switch (cmd) {
      case 'join': {
        if (!resolvedUserId && !twitchUsername) {
          return json({ reply: `@${displayName} To join from Kick, first link your Twitch: "spmt link <your_twitch_username>"` });
        }
        // If they have a linked account, join works the same
        if (resolvedUserId && state.tagPlayers[resolvedUserId]) {
          return json({ reply: `@${displayName} You're already in the game!` });
        }
        // Try to join via twitch username
        const joinName = twitchUsername || args[1]?.replace('@', '');
        if (!joinName) {
          return json({ reply: `@${displayName} Usage: "spmt link <twitch_username>" to link, then "spmt join"` });
        }
        const twitchUser = await lookupTwitchUser(joinName.toLowerCase());
        if (!twitchUser) {
          return json({ reply: `@${displayName} Twitch user "${joinName}" not found.` });
        }
        const newUserId = `user_${twitchUser.id}`;
        if (state.tagPlayers[newUserId]) {
          return json({ reply: `@${displayName} That account is already in the game!` });
        }
        const isAnyoneIt = Object.values(state.tagPlayers).some((p: any) => p.isIt);
        await updateAppState((s) => {
          s.tagPlayers[newUserId] = {
            id: newUserId,
            twitchUsername: twitchUser.login.toLowerCase(),
            avatarUrl: twitchUser.profile_image_url || '',
            kickUsername: (username || '').toLowerCase(),
            score: 0, tags: 0, tagged: 0,
            isIt: !isAnyoneIt, isActive: false, isPlayer: true,
          };
          s.botChannels[twitchUser.login.toLowerCase()] = {
            name: twitchUser.login.toLowerCase(),
            status: 'joined',
            lastUpdated: new Date().toISOString(),
          };
        });
        return json({ reply: `@${displayName} joined the tag game from Kick! 🎯` });
      }

      case 'link': {
        // Link Kick username to existing Twitch player: "spmt link <twitch_username>"
        const linkTarget = args[1]?.replace('@', '').toLowerCase();
        if (!linkTarget) {
          return json({ reply: `@${displayName} Usage: "spmt link <your_twitch_username>" — links your Kick to your Twitch account.` });
        }
        const twitchUser = await lookupTwitchUser(linkTarget);
        if (!twitchUser) {
          return json({ reply: `@${displayName} Twitch user "${linkTarget}" not found.` });
        }
        const targetId = `user_${twitchUser.id}`;
        const existing = state.tagPlayers[targetId];
        if (!existing) {
          return json({ reply: `@${displayName} "${linkTarget}" isn't in the game yet. Use "spmt join" after linking.` });
        }
        await updateAppState((s) => {
          if (s.tagPlayers[targetId]) {
            s.tagPlayers[targetId].kickUsername = (username || '').toLowerCase();
          }
        });
        return json({ reply: `@${displayName} ✅ Kick account linked to Twitch "${linkTarget}"!` });
      }

      case 'tag': {
        if (!resolvedUserId) {
          return json({ reply: `@${displayName} Link your account first: "spmt link <twitch_username>"` });
        }
        const target = args[1]?.replace('@', '').toLowerCase();
        if (!target) {
          return json({ reply: `@${displayName} Usage: "spmt tag @username"` });
        }
        // Find target by twitchUsername or kickUsername
        const targetPlayer = Object.values(state.tagPlayers).find(
          (p: any) => (p.twitchUsername || '').toLowerCase() === target || (p.kickUsername || '').toLowerCase() === target
        ) as any;
        if (!targetPlayer) {
          return json({ reply: `@${displayName} ${target} is not in the game!` });
        }

        const result = await updateAppState((s) => {
          const tagger = s.tagPlayers[resolvedUserId!];
          const tgt = s.tagPlayers[targetPlayer.id];
          if (!tagger) return { error: 'You are not in the game!' };
          if (!tgt) return { error: 'Target not in the game!' };

          const players = Object.values(s.tagPlayers) as any[];
          const whoIsIt = players.find((p) => p?.isIt);
          const anyoneIt = !!whoIsIt;
          if (anyoneIt && !tagger.isIt) {
            return { error: `You are not it! ${whoIsIt?.twitchUsername || 'Unknown'} is it.` };
          }

          const immuneCheck = isPlayerImmune(tgt, resolvedUserId!);
          if (immuneCheck.immune) {
            return { error: `${tgt.twitchUsername || 'Target'} is immune (${immuneCheck.reason})` };
          }

          const doublePoints = !anyoneIt;
          s.tagHistory.push({ id: makeId('hist'), taggerId: resolvedUserId, taggedId: targetPlayer.id, streamerId: channel || 'kick', timestamp: Date.now(), doublePoints });
          s.chatTags.push({ id: makeId('tag'), taggerId: resolvedUserId, taggedId: targetPlayer.id, streamerId: channel || 'kick', timestamp: Date.now(), doublePoints });

          if (s.tagGame?.state) {
            s.tagGame.state.currentIt = targetPlayer.id;
            s.tagGame.state.lastTagTime = Date.now();
          }

          const scoring = getScoringSettings(s);
          tagger.score = (tagger.score || 0) + (doublePoints ? scoring.tagSuccessPoints * 2 : scoring.tagSuccessPoints);
          tagger.tags = (tagger.tags || 0) + 1;
          tagger.isIt = false;
          tagger.timedImmunityUntil = Date.now() + 20 * 60 * 1000;

          tgt.score = (tgt.score || 0) - scoring.tagPenaltyPoints;
          tgt.tagged = (tgt.tagged || 0) + 1;
          tgt.isIt = true;
          tgt.noTagbackFrom = resolvedUserId;
          tgt.lastTaggedInStreamId = channel || 'kick';

          return { success: true, doublePoints };
        });

        if ((result as any).error) {
          return json({ reply: `@${displayName} ${(result as any).error}` });
        }
        const tagMsg = (result as any).doublePoints
          ? `🔥 ${displayName} tagged @${target} for DOUBLE POINTS from Kick! ${target} is now it! 🔥`
          : `🎯 ${displayName} tagged @${target} from Kick! ${target} is now it!`;
        return json({ reply: tagMsg, broadcast: tagMsg });
      }

      case 'status':
      case 'whosit': {
        const itPlayer = Object.values(state.tagPlayers).find((p: any) => p.isIt) as any;
        const itName = itPlayer?.twitchUsername || null;
        const reply = itName
          ? `@${displayName} ${itName} is it!`
          : `@${displayName} 🔥 FREE FOR ALL! Anyone can tag for DOUBLE POINTS! 🔥`;
        return json({ reply });
      }

      case 'score': {
        if (!resolvedUserId) {
          return json({ reply: `@${displayName} Link your account first: "spmt link <twitch_username>"` });
        }
        const player = getPlayer() as any;
        if (!player) {
          return json({ reply: `@${displayName} You're not in the game! Use "spmt join"` });
        }
        const tagCounts: Record<string, { tags: number; tagged: number }> = {};
        const scoring = getScoringSettings(state);
        for (const entry of state.tagHistory) {
          if ((entry as any).blocked) continue;
          const from = (entry as any).taggerId;
          const to = (entry as any).taggedId;
          if (from && from !== 'system') { if (!tagCounts[from]) tagCounts[from] = { tags: 0, tagged: 0 }; tagCounts[from].tags += 1; }
          if (to && to !== 'system' && to !== 'free-for-all') { if (!tagCounts[to]) tagCounts[to] = { tags: 0, tagged: 0 }; tagCounts[to].tagged += 1; }
        }
        const allPlayers = Object.values(state.tagPlayers).map((p: any) => {
          const c = tagCounts[p.id] || { tags: 0, tagged: 0 };
          return { ...p, score: scoreFromTagCounts(c, scoring) + (p.bingoPoints || 0) };
        }).sort((a, b) => b.score - a.score);
        const rank = allPlayers.findIndex((p) => p.id === resolvedUserId) + 1;
        const myScore = allPlayers.find((p) => p.id === resolvedUserId);
        return json({ reply: `@${displayName} Rank: #${rank}/${allPlayers.length} | Score: ${myScore?.score || 0} pts | Tags: ${myScore?.tags || 0} | Tagged: ${myScore?.tagged || 0} | Pass: ${player.passCount || 0}/3` });
      }

      case 'rank': {
        const tagCounts: Record<string, { tags: number; tagged: number }> = {};
        const scoring = getScoringSettings(state);
        for (const entry of state.tagHistory) {
          if ((entry as any).blocked) continue;
          const from = (entry as any).taggerId;
          const to = (entry as any).taggedId;
          if (from && from !== 'system') { if (!tagCounts[from]) tagCounts[from] = { tags: 0, tagged: 0 }; tagCounts[from].tags += 1; }
          if (to && to !== 'system' && to !== 'free-for-all') { if (!tagCounts[to]) tagCounts[to] = { tags: 0, tagged: 0 }; tagCounts[to].tagged += 1; }
        }
        const sorted = Object.values(state.tagPlayers)
          .filter((p: any) => (p.twitchUsername || '').toLowerCase() !== 'mtman1987')
          .map((p: any) => { const c = tagCounts[p.id] || { tags: 0, tagged: 0 }; return { ...p, score: scoreFromTagCounts(c, scoring) + (p.bingoPoints || 0) }; })
          .sort((a, b) => b.score - a.score);
        const top3 = sorted.slice(0, 3).map((p, i) => `#${i + 1} ${p.twitchUsername}: ${p.score}`).join(' | ');
        return json({ reply: `@${displayName} Top 3: ${top3}` });
      }

      case 'pass': {
        if (!resolvedUserId) {
          return json({ reply: `@${displayName} Link your account first: "spmt link <twitch_username>"` });
        }
        const target = args[1]?.replace('@', '').toLowerCase();
        if (!target) {
          return json({ reply: `@${displayName} Usage: "spmt pass @username" — tag ANYONE for DOUBLE POINTS!` });
        }
        const targetPlayer = Object.values(state.tagPlayers).find(
          (p: any) => (p.twitchUsername || '').toLowerCase() === target || (p.kickUsername || '').toLowerCase() === target
        ) as any;
        if (!targetPlayer) {
          return json({ reply: `@${displayName} ${target} is not in the game!` });
        }
        const passResult = await updateAppState((s) => {
          const tagger = s.tagPlayers[resolvedUserId!];
          const tgt = s.tagPlayers[targetPlayer.id];
          if (!tagger) return { error: 'You are not in the game!' };
          if (!tgt) return { error: 'Target not in the game!' };
          if (tagger.passCount === undefined) tagger.passCount = tagger.hasPass ? 1 : 0;
          if (tagger.passCount <= 0) return { error: "You don't have a pass!" };
          if (resolvedUserId === targetPlayer.id) return { error: "You can't pass to yourself!" };
          const immuneCheck = isPlayerImmune(tgt, resolvedUserId!);
          if (immuneCheck.immune) return { error: `${tgt.twitchUsername || 'Target'} is immune (${immuneCheck.reason})` };

          tagger.passCount -= 1;
          tagger.hasPass = tagger.passCount > 0;
          s.tagHistory.push({ id: makeId('hist'), taggerId: resolvedUserId, taggedId: targetPlayer.id, streamerId: channel || 'kick', timestamp: Date.now(), doublePoints: true, passUsed: true });
          s.chatTags.push({ id: makeId('tag'), taggerId: resolvedUserId, taggedId: targetPlayer.id, streamerId: channel || 'kick', timestamp: Date.now(), doublePoints: true, passUsed: true });

          const currentIt = Object.values(s.tagPlayers).find((p: any) => p.isIt) as any;
          if (currentIt) currentIt.isIt = false;
          s.tagGame.state.currentIt = targetPlayer.id;
          s.tagGame.state.lastTagTime = Date.now();

          const scoring = getScoringSettings(s);
          tagger.score = (tagger.score || 0) + scoring.tagSuccessPoints * 2;
          tagger.tags = (tagger.tags || 0) + 1;
          tagger.isIt = false;
          tagger.timedImmunityUntil = Date.now() + 20 * 60 * 1000;
          tgt.score = (tgt.score || 0) - scoring.tagPenaltyPoints;
          tgt.tagged = (tgt.tagged || 0) + 1;
          tgt.isIt = true;
          tgt.noTagbackFrom = resolvedUserId;
          return { success: true };
        });
        if ((passResult as any).error) {
          return json({ reply: `@${displayName} ${(passResult as any).error}` });
        }
        const passMsg = `🎟️ ${displayName} used their PASS to tag @${target} for DOUBLE POINTS from Kick! ${target} is now it!`;
        return json({ reply: passMsg, broadcast: passMsg });
      }

      case 'away': {
        if (!resolvedUserId) {
          return json({ reply: `@${displayName} Link your account first: "spmt link <twitch_username>"` });
        }
        const player = getPlayer() as any;
        if (!player) return json({ reply: `@${displayName} You're not in the game!` });
        const isAway = player.sleepingImmunity || player.offlineImmunity;
        await updateAppState((s) => {
          const p = s.tagPlayers[resolvedUserId!];
          if (!p) return;
          if (isAway) {
            p.sleepingImmunity = false; p.offlineImmunity = false; p.timedImmunityUntil = null; p.noTagbackFrom = null;
          } else {
            p.sleepingImmunity = true;
          }
        });
        return json({ reply: isAway ? `@${displayName} is back! ☀️` : `@${displayName} is now away 😴 (immune)` });
      }

      case 'pack':
      case 'quackpack': {
        if (!resolvedUserId) {
          return json({ reply: `@${displayName} Link your account first: "spmt link <twitch_username>"` });
        }
        const packRes = await fetch(`${getPublicAppOrigin(req)}/api/quackverse/pack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-bot-secret': STREAMWEAVER_SECRET },
          body: JSON.stringify({ action: 'open', userId: resolvedUserId, twitchUsername: resolvedTwitchUsername }),
        });
        const packData = await packRes.json().catch(() => null);
        if (!packRes.ok || packData?.error) {
          return json({ reply: `@${displayName} ${packData?.error || 'Could not open pack.'} ${Number(packData?.packsRemaining || 0)}/3 packs left today.` });
        }
        const names = Array.isArray(packData.pack)
          ? packData.pack.map((card: any) => card?.name).filter(Boolean).slice(0, 5).join(', ')
          : 'pack opened';
        return json({ reply: `🦆 @${displayName} opened a Quackverse pack: ${names}. ${Number(packData.packsRemaining || 0)}/3 packs left today.` });
      }

      case 'players': {
        const players = Object.values(state.tagPlayers) as any[];
        const names = players.slice(0, 20).map((p) => p.twitchUsername || p.id).join(', ');
        const more = players.length > 20 ? ` (+${players.length - 20} more)` : '';
        return json({ reply: `@${displayName} ${players.length} players: ${names}${more}` });
      }

      case 'live': {
        // Fetch live members from Discord integration
        try {
          const liveRes = await fetch(`${getPublicAppOrigin(req)}/api/discord/live-members`, {
              headers: { 'x-bot-secret': STREAMWEAVER_SECRET },
            });
          if (!liveRes.ok) {
            return json({ reply: `@${displayName} Could not fetch live data.` });
          }
          const liveData = await liveRes.json();
          const players = Object.values(state.tagPlayers) as any[];
          const playerSet = new Set(players.map((p: any) => (p.twitchUsername || '').toLowerCase()).filter(Boolean));
          const liveMembers = (liveData?.liveMembers || []).filter((m: any) => playerSet.has((m.twitchUsername || '').toLowerCase()));

          if (liveMembers.length === 0) {
            return json({ reply: `@${displayName} No players are live right now!` });
          }

          const liveNames = liveMembers.slice(0, 15).map((m: any) => `🟢${m.twitchUsername}`).join(', ');
          const more = liveMembers.length > 15 ? ` (+${liveMembers.length - 15} more)` : '';
          return json({ reply: `@${displayName} ${liveMembers.length} players live: ${liveNames}${more}` });
        } catch {
          return json({ reply: `@${displayName} Could not fetch live data.` });
        }
      }

      case 'help': {
        return json({ reply: `@${displayName} "spmt link <twitch>" = Link | "spmt join" = Join | "spmt tag @user" = Tag | "spmt pass @user" = Pass | "spmt pack" = Open Quackverse pack | "spmt status" = Who's it | "spmt score" = Stats | "spmt rank" = Top 3 | "spmt live" = Who's live | "spmt players" = List | "spmt away" = Immunity | "spmt rules" = Rules` });
      }

      case 'rules': {
        return json({ reply: `@${displayName} Tag someone with "spmt tag @user". If you're it, tag someone else! "spmt away" = immunity. "spmt pass @user" = double-points tag. Full guide: https://chat-tag-new.fly.dev/about` });
      }

      default: {
        return json({ reply: `@${displayName} Unknown command. Type "spmt help" for commands.` });
      }
    }
  } catch (error: any) {
    console.error('[Kick Command] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function json(data: any) {
  return NextResponse.json(data);
}
