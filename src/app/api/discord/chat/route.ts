import { NextRequest, NextResponse } from 'next/server';
import { readAppState, updateAppState } from '@/lib/volume-store';
import { isBotRequest } from '@/lib/auth';
import { getScoringSettings, scoreFromTagCounts } from '@/lib/scoring';

export const dynamic = 'force-dynamic';

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';

async function sendDiscordReply(channelId: string, content: string, replyToMessageId?: string) {
  const body: any = { content };
  if (replyToMessageId) {
    body.message_reference = { message_id: replyToMessageId };
  }
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[Discord Chat] Failed to send reply: ${res.status} ${text}`);
  }
  return res;
}

export async function POST(req: NextRequest) {
  if (!isBotRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { userId: discordUserId, guildId, message, userName, channelId, messageId, userAvatar } = body;

    if (!message || !channelId) {
      return NextResponse.json({ error: 'message and channelId required' }, { status: 400 });
    }

    // Check if it's an spmt command
    const rawMessage = message.trim();
    const msg = rawMessage.toLowerCase();
    if (!msg.startsWith('spmt ') && !msg.startsWith('@spmt ')) {
      // Not a command — track chat activity if player exists, then return
      // Look up player by discord ID or username
      const state = await readAppState();
      const player = Object.values(state.tagPlayers || {}).find(
        (p: any) => p.discordUsername?.toLowerCase() === userName?.toLowerCase() ||
                    p.discordId === discordUserId
      ) as any;
      
      if (player) {
        await updateAppState((s) => {
          const p = s.tagPlayers[player.id];
          if (p) {
            p.lastChatAt = Date.now();
            p.lastSeenChannel = 'discord';
            if (p.sleepingImmunity || p.offlineImmunity) {
              p.sleepingImmunity = false;
              p.offlineImmunity = false;
            }
            // Store discordId if not already set
            if (!p.discordId && discordUserId) {
              p.discordId = discordUserId;
            }
          }
        });
      }
      return NextResponse.json({ success: true, command: false });
    }

    // Parse command
    const normalized = msg.startsWith('@spmt ') ? msg : '@' + msg;
    const args = normalized.split(/\s+/).slice(1); // remove "@spmt"
    const cmd = args[0];

    // Look up the player by discordUsername or discordId
    const state = await readAppState();
    const player = Object.values(state.tagPlayers || {}).find(
      (p: any) => p.discordUsername?.toLowerCase() === userName?.toLowerCase() ||
                  p.discordId === discordUserId
    ) as any;

    const gameUserId = player?.id; // e.g. "user_12345"
    const displayName = player?.twitchUsername || userName;

    // Helper to reply
    const reply = (text: string) => sendDiscordReply(channelId, text, messageId);

    // Capture away state before any mutations (needed for away toggle)
    const wasAway = player ? (player.sleepingImmunity || player.offlineImmunity) : false;

    // Track chat activity (skip immunity clearing for 'away' command)
    if (player) {
      await updateAppState((s) => {
        const p = s.tagPlayers[player.id];
        if (p) {
          p.lastChatAt = Date.now();
          p.lastSeenChannel = 'discord';
          if (cmd !== 'away' && (p.sleepingImmunity || p.offlineImmunity)) {
            p.sleepingImmunity = false;
            p.offlineImmunity = false;
          }
          // Store discordId if not already set
          if (!p.discordId && discordUserId) {
            p.discordId = discordUserId;
          }
        }
      });
    }

    // Process commands
    if (cmd === 'join') {
      if (player) {
        await reply(`@${userName} You're already in the game!`);
        return NextResponse.json({ success: true, reply: 'already-joined' });
      }
      // For Discord join without a linked account, create with discord info
      // They need to link their Twitch first OR we create a discord-based player
      await reply(`@${userName} To join, link your Twitch first in Twitch chat with "spmt discord ${userName}" then use "spmt join" in Twitch chat. Or ask a mod to add you!`);
      return NextResponse.json({ success: true, reply: 'join-instructions' });
    }

    // All other commands require being in the game
    if (!player || !gameUserId) {
      await reply(`@${userName} You're not in the game! Link your Discord in Twitch chat with "spmt discord ${userName}" then join.`);
      return NextResponse.json({ success: true, reply: 'not-in-game' });
    }

    if (cmd === 'tag') {
      const target = args[1]?.replace(/^@+/, '').toLowerCase();
      if (!target) {
        await reply(`@${userName} Usage: "spmt tag @username"`);
        return NextResponse.json({ success: true });
      }
      // Resolve target
      const players = Object.values(state.tagPlayers || {}) as any[];
      const targetPlayer = players.find(p => {
        const keys = [p.twitchUsername, p.username, p.displayName, p.kickUsername, p.discordUsername]
          .map(k => (k || '').toLowerCase()).filter(Boolean);
        return keys.includes(target);
      });
      if (!targetPlayer) {
        await reply(`@${userName} Player "${target}" not found!`);
        return NextResponse.json({ success: true });
      }
      // Call the tag API internally via fetch to self
      const tagRes = await fetch(new URL('/api/tag', req.url).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bot-secret': process.env.BOT_SECRET_KEY || '1234' },
        body: JSON.stringify({ action: 'tag', userId: gameUserId, twitchUsername: player.twitchUsername, targetUserId: targetPlayer.id, streamerId: 'discord' }),
      });
      const tagData = await tagRes.json();
      if (tagData.error) {
        await reply(`@${userName} ${tagData.error}`);
      } else {
        const tagMsg = tagData.doublePoints
          ? `🔥 ${displayName} tagged @${targetPlayer.twitchUsername || target} for DOUBLE POINTS! 🔥`
          : `🎯 ${displayName} tagged @${targetPlayer.twitchUsername || target} who is now it!`;
        await reply(tagMsg);
        // Also trigger announce
        await fetch(new URL('/api/discord/announce', req.url).toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tagger: displayName, tagged: targetPlayer.twitchUsername || target, doublePoints: tagData.doublePoints }),
        }).catch(() => {});
      }
      return NextResponse.json({ success: true });
    }

    if (cmd === 'pass') {
      const target = args[1]?.replace(/^@+/, '').toLowerCase();
      if (!target) {
        await reply(`@${userName} Usage: "spmt pass @username" — Use your pass to tag someone for DOUBLE POINTS!`);
        return NextResponse.json({ success: true });
      }
      const players = Object.values(state.tagPlayers || {}) as any[];
      const targetPlayer = players.find(p => {
        const keys = [p.twitchUsername, p.username, p.displayName, p.kickUsername, p.discordUsername]
          .map(k => (k || '').toLowerCase()).filter(Boolean);
        return keys.includes(target);
      });
      if (!targetPlayer) {
        await reply(`@${userName} Player "${target}" not found!`);
        return NextResponse.json({ success: true });
      }
      const passRes = await fetch(new URL('/api/tag', req.url).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bot-secret': process.env.BOT_SECRET_KEY || '1234' },
        body: JSON.stringify({ action: 'use-pass', userId: gameUserId, twitchUsername: player.twitchUsername, targetUserId: targetPlayer.id, streamerId: 'discord' }),
      });
      const passData = await passRes.json();
      if (passData.error) {
        await reply(`@${userName} ${passData.error}`);
      } else {
        await reply(`🎟️ ${displayName} used their PASS to tag @${targetPlayer.twitchUsername || target} for DOUBLE POINTS!`);
        await fetch(new URL('/api/discord/announce', req.url).toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tagger: displayName, tagged: targetPlayer.twitchUsername || target, doublePoints: true, message: 'Used a Pass' }),
        }).catch(() => {});
      }
      return NextResponse.json({ success: true });
    }

    if (cmd === 'status' || cmd === 'whosit') {
      const players = Object.values(state.tagPlayers || {}) as any[];
      const itPlayer = players.find(p => p.isIt);
      if (itPlayer) {
        await reply(`🏷️ ${itPlayer.twitchUsername || 'someone'} is IT! Tag them or be tagged!`);
      } else {
        await reply(`🏷️ FREE FOR ALL — no one is it! Anyone can tag!`);
      }
      return NextResponse.json({ success: true });
    }

    if (cmd === 'score' || cmd === 'rank') {
      const tagCounts: Record<string, { tags: number; tagged: number }> = {};
      const scoring = getScoringSettings(state);
      for (const entry of state.tagHistory || []) {
        if ((entry as any).blocked) continue;
        const from = (entry as any).taggerId;
        const to = (entry as any).taggedId;
        if (from && from !== 'system') { if (!tagCounts[from]) tagCounts[from] = { tags: 0, tagged: 0 }; tagCounts[from].tags += 1; }
        if (to && to !== 'system' && to !== 'free-for-all') { if (!tagCounts[to]) tagCounts[to] = { tags: 0, tagged: 0 }; tagCounts[to].tagged += 1; }
      }
      const allPlayers = Object.values(state.tagPlayers || {}).map((p: any) => {
        const c = tagCounts[p.id] || { tags: 0, tagged: 0 };
        return { ...p, score: scoreFromTagCounts(c, scoring) + (p.bingoPoints || 0), tags: c.tags, tagged: c.tagged };
      }).sort((a, b) => b.score - a.score);

      if (cmd === 'score') {
        const rank = allPlayers.findIndex(p => p.id === gameUserId) + 1;
        const myScore = allPlayers.find(p => p.id === gameUserId);
        await reply(`@${userName} Rank: #${rank}/${allPlayers.length} | Score: ${myScore?.score || 0} pts | Tags: ${myScore?.tags || 0} | Tagged: ${myScore?.tagged || 0} | 🎟️ Pass: ${player.passCount || 0}/3`);
      } else {
        const top5 = allPlayers.slice(0, 5);
        const lines = top5.map((p, i) => `#${i + 1} ${p.twitchUsername || 'unknown'} (${p.score || 0}pts)`).join(' | ');
        await reply(`🏆 Top 5: ${lines}`);
      }
      return NextResponse.json({ success: true });
    }

    if (cmd === 'players') {
      const players = Object.values(state.tagPlayers || {}) as any[];
      await reply(`@${userName} ${players.length} players in the game.`);
      return NextResponse.json({ success: true });
    }

    if (cmd === 'away') {
      await updateAppState((s) => {
        const p = s.tagPlayers[gameUserId];
        if (!p) return;
        if (wasAway) {
          p.sleepingImmunity = false;
          p.offlineImmunity = false;
          p.timedImmunityUntil = null;
          p.noTagbackFrom = null;
        } else {
          p.sleepingImmunity = true;
        }
      });
      await reply(`@${userName} ${wasAway ? '☀️ Away mode OFF — you can be tagged.' : '💤 Away mode ON — you are immune.'}`);
      return NextResponse.json({ success: true });
    }

    if (cmd === 'help') {
      await reply(`@${userName} Commands: "spmt join" | "spmt tag @user" | "spmt pass @user" | "spmt status" | "spmt score" | "spmt rank" | "spmt players" | "spmt away" | "spmt help"`);
      return NextResponse.json({ success: true });
    }

    // Unknown command
    await reply(`@${userName} Unknown command "${cmd}". Try "spmt help"`);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('[Discord Chat] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
