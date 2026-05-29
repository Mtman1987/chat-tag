import { NextRequest, NextResponse } from 'next/server';
import { readAppState, updateAppState } from '@/lib/volume-store';
import { isBotRequest } from '@/lib/auth';
import { getScoringSettings, scoreFromTagCounts } from '@/lib/scoring';

export const dynamic = 'force-dynamic';

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const DISCORD_WEBHOOK_URL =
  process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_TAG_WEBHOOK_URL || '';
const CHAT_TAG_WEBHOOK_NAME = process.env.CHAT_TAG_WEBHOOK_NAME || 'Chat Tag';
const CHAT_TAG_AVATAR_URL =
  process.env.CHAT_TAG_AVATAR_URL ||
  process.env.DISCORD_CHAT_TAG_AVATAR_URL ||
  '';
const CLEANUP_DELAY_MS = 5 * 60 * 1000;
const REQUIRE_DISCORD_CHAT_SECRET = process.env.DISCORD_CHAT_REQUIRE_SECRET === 'true';
const ACTIVE_CHAT_MS = Number(process.env.AUTO_ROTATE_MINUTES || 4) * 60 * 1000;

function getInternalAppOrigin() {
  return process.env.INTERNAL_APP_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3000}`;
}

async function deleteDiscordMessage(channelId: string, messageId?: string) {
  if (!DISCORD_BOT_TOKEN || !channelId || !messageId) return;

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
  }).catch(() => null);

  if (response && !response.ok && response.status !== 404) {
    console.error(`[Discord Chat] Failed to delete message: ${response.status} ${await response.text().catch(() => '')}`);
  }
}

async function sendDiscordReply(channelId: string, content: string) {
  const payload: any = {
    username: CHAT_TAG_WEBHOOK_NAME,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: 'Chat Tag',
        description: content,
        color: 0x00d9ff,
        footer: { text: 'SPMT Chat Tag' },
        timestamp: new Date().toISOString(),
      },
    ],
  };
  if (CHAT_TAG_AVATAR_URL) payload.avatar_url = CHAT_TAG_AVATAR_URL;

  if (DISCORD_WEBHOOK_URL) {
    const webhookUrl = new URL(DISCORD_WEBHOOK_URL);
    webhookUrl.searchParams.set('wait', 'true');
    const webhookRes = await fetch(webhookUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!webhookRes.ok) {
      console.error(`[Discord Chat] Failed to send webhook reply: ${webhookRes.status} ${await webhookRes.text().catch(() => '')}`);
    }
    const sent = await webhookRes.json().catch(() => null);
    if (sent?.id) {
      setTimeout(() => {
        fetch(`${DISCORD_WEBHOOK_URL}/messages/${sent.id}`, { method: 'DELETE' }).catch(() => {});
      }, CLEANUP_DELAY_MS);
    }
    return webhookRes;
  }

  const fallbackPayload: any = { ...payload };
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    },
    body: JSON.stringify(fallbackPayload),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[Discord Chat] Failed to send reply: ${res.status} ${text}`);
  }
  const sent = await res.json().catch(() => null);
  if (sent?.id) {
    setTimeout(() => {
      deleteDiscordMessage(channelId, sent.id).catch(() => {});
    }, CLEANUP_DELAY_MS);
  }
  return res;
}

function normalizeTargetArg(value?: string) {
  return String(value || '').trim().toLowerCase().replace(/^@+/, '');
}

function findPlayerForDiscordUser(players: any[], discordUserId?: string, userName?: string) {
  const normalizedUserName = normalizeTargetArg(userName);
  return players.find((p: any) => {
    if (discordUserId && p.discordId === discordUserId) return true;
    if (!normalizedUserName || normalizedUserName === 'unknown') return false;

    const keys = [p.discordUsername, p.twitchUsername, p.username, p.displayName, p.kickUsername]
      .map((key) => normalizeTargetArg(key))
      .filter(Boolean);
    return keys.includes(normalizedUserName);
  }) as any;
}

function findTargetPlayer(players: any[], targetArg?: string) {
  const target = normalizeTargetArg(targetArg);
  const mention = target.match(/^<@!?(\d+)>$/);
  if (mention) {
    return players.find((p: any) => p.discordId === mention[1]);
  }

  return players.find((p: any) => {
    const keys = [p.twitchUsername, p.username, p.displayName, p.kickUsername, p.discordUsername]
      .map(k => (k || '').toLowerCase()).filter(Boolean);
    return keys.includes(target);
  });
}

async function announceTagEvent(req: NextRequest, body: any) {
  await fetch(`${getInternalAppOrigin()}/api/discord/announce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-bot-secret': process.env.BOT_SECRET_KEY || '1234' },
    body: JSON.stringify(body),
  }).catch((error) => console.error('[Discord Chat] Announce failed:', error));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('[Discord Chat] Raw payload keys', {
      keys: Object.keys(body || {}),
      rootKeys: body?.root ? Object.keys(body.root || {}) : [],
    });

    // Support Kite/root-wrapped payloads, direct payloads, and older field names.
    const data = body?.root || body || {};
    const discordUserId = data.userId || data.discordUserId;
    const guildId = data.guildId || data.serverId;
    const message = data.message || data.content || '';
    const rawUserName = data.userName || data.displayName || data.username;
    const channelId = data.channelId || '';
    const messageId = data.messageId || data.userMessageId || '';
    const userAvatar = data.userAvatar || data.avatarUrl || '';
    const userName = rawUserName || 'Unknown';
    const hasBotSecret = isBotRequest(req);

    if (!message || !channelId) {
      console.warn('[Discord Chat] Missing required Discord chat fields', {
        hasMessage: Boolean(message),
        hasChannelId: Boolean(channelId),
        keys: Object.keys(data || {}),
      });
      return NextResponse.json({ error: 'message and channelId required' }, { status: 400 });
    }

    if (!hasBotSecret && REQUIRE_DISCORD_CHAT_SECRET) {
      console.warn('[Discord Chat] Unauthorized request blocked');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if it's an spmt command
    const rawMessage = message.trim();
    const msg = rawMessage.toLowerCase();
    console.log('[Discord Chat] Received message', {
      command: msg.startsWith('spmt ') || msg.startsWith('@spmt '),
      channelId,
      messageId,
      userName,
      hasBotSecret,
    });

    if (!msg.startsWith('spmt ') && !msg.startsWith('@spmt ')) {
      // Not a command — track chat activity if player exists, then return
      // Look up player by discord ID or username
      const state = await readAppState();
      const player = Object.values(state.tagPlayers || {}).find(
        (p: any) => (discordUserId && p.discordId === discordUserId) ||
                    (userName && userName !== 'Unknown' && p.discordUsername?.toLowerCase() === userName.toLowerCase())
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
    console.log(`[Discord Chat] Processing spmt ${cmd || '(empty)'}`);

    if (cmd === 'controls' || cmd === 'control') {
      return NextResponse.json({ success: true, skipped: 'controls-owned-by-dsh' });
    }

    await deleteDiscordMessage(channelId, messageId);

    // Look up the player by discordUsername or discordId
    const state = await readAppState();
    const players = Object.values(state.tagPlayers || {}) as any[];
    const player = findPlayerForDiscordUser(players, discordUserId, userName);

    const gameUserId = player?.id; // e.g. "user_12345"
    const displayName = player?.twitchUsername || userName;

    // Helper to reply
    const reply = (text: string) => sendDiscordReply(channelId, text);

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
      await reply(`@${userName} To join from Discord, link your Twitch account with the Mountaineer Launch Twitch link button, then try again.`);
      return NextResponse.json({ success: true, reply: 'join-instructions' });
    }

    // All other commands require being in the game
    if (!player || !gameUserId) {
      await reply(`@${userName} You're not linked to a Chat Tag player yet. Use the Twitch link button in Mountaineer Launch, then try again.`);
      return NextResponse.json({ success: true, reply: 'not-in-game' });
    }

    if (cmd === 'tag') {
      const target = normalizeTargetArg(args[1]);
      if (!target) {
        await reply(`@${userName} Usage: "spmt tag @username"`);
        return NextResponse.json({ success: true });
      }
      // Resolve target
      const targetPlayer = findTargetPlayer(players, args[1]);
      if (!targetPlayer) {
        await reply(`@${userName} Player "${target}" not found!`);
        return NextResponse.json({ success: true });
      }
      // Call the tag API internally via fetch to self
      const tagRes = await fetch(`${getInternalAppOrigin()}/api/tag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bot-secret': process.env.BOT_SECRET_KEY || '1234' },
        body: JSON.stringify({ action: 'tag', userId: gameUserId, twitchUsername: player.twitchUsername, targetUserId: targetPlayer.id, streamerId: 'discord' }),
      });
      const tagData = await tagRes.json();
      if (tagData.error) {
        await reply(`@${userName} ${tagData.error}`);
      } else {
        await announceTagEvent(req, { tagger: displayName, tagged: targetPlayer.twitchUsername || target, doublePoints: tagData.doublePoints });
      }
      return NextResponse.json({ success: true });
    }

    if (cmd === 'pass') {
      const target = normalizeTargetArg(args[1]);
      if (!target) {
        await reply(`@${userName} Usage: "spmt pass @username" — Use your pass to tag someone for DOUBLE POINTS!`);
        return NextResponse.json({ success: true });
      }
      const targetPlayer = findTargetPlayer(players, args[1]);
      if (!targetPlayer) {
        await reply(`@${userName} Player "${target}" not found!`);
        return NextResponse.json({ success: true });
      }
      const passRes = await fetch(`${getInternalAppOrigin()}/api/tag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bot-secret': process.env.BOT_SECRET_KEY || '1234' },
        body: JSON.stringify({ action: 'use-pass', userId: gameUserId, twitchUsername: player.twitchUsername, targetUserId: targetPlayer.id, streamerId: 'discord' }),
      });
      const passData = await passRes.json();
      if (passData.error) {
        await reply(`@${userName} ${passData.error}`);
      } else {
        await announceTagEvent(req, { tagger: displayName, tagged: targetPlayer.twitchUsername || target, doublePoints: true, message: 'Used a Pass' });
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

    if (cmd === 'live') {
      const liveRes = await fetch(`${getInternalAppOrigin()}/api/discord/live-members`, {
        cache: 'no-store',
      }).catch((error) => {
        console.error('[Discord Chat] Live members fetch failed:', error);
        return null;
      });

      if (!liveRes?.ok) {
        await reply(`@${userName} Could not check live players right now.`);
        return NextResponse.json({ success: true, reply: 'live-check-failed' });
      }

      const liveData = await liveRes.json().catch(() => ({}));
      const playerSet = new Set(
        players
          .map((p: any) => (p.twitchUsername || p.username || '').toLowerCase())
          .filter(Boolean)
      );
      const liveMembers = (liveData.liveMembers || []).filter((member: any) =>
        playerSet.has(String(member.twitchUsername || '').toLowerCase())
      );
      const liveLogins = new Set(
        liveMembers.map((member: any) => String(member.twitchUsername || '').toLowerCase()).filter(Boolean)
      );

      if (liveMembers.length === 0) {
        await reply(`@${userName} No players are live right now!`);
        return NextResponse.json({ success: true });
      }

      const now = Date.now();
      const channelChatters: Record<string, string[]> = {};
      for (const p of players) {
        const pName = String(p.twitchUsername || p.username || '').toLowerCase();
        if (!pName || liveLogins.has(pName)) continue;
        const lastChat = Number(p.lastChatAt || 0);
        const seenChannel = String(p.lastSeenChannel || '').toLowerCase();
        if (!lastChat || now - lastChat > ACTIVE_CHAT_MS) continue;

        const key = seenChannel === 'discord' ? '_discord' : seenChannel;
        if (key === '_discord' || liveLogins.has(key)) {
          if (!channelChatters[key]) channelChatters[key] = [];
          channelChatters[key].push(pName);
        }
      }

      const groups: string[] = [];
      let totalChatters = 0;
      for (const member of liveMembers) {
        const login = String(member.twitchUsername || '').toLowerCase();
        const chatters = channelChatters[login] || [];
        totalChatters += chatters.length;
        groups.push(`🟢${login}${chatters.length ? ` > 💬${chatters.join(', ')}` : ''}`);
      }
      const discordChatters = channelChatters._discord || [];
      if (discordChatters.length > 0) {
        totalChatters += discordChatters.length;
        groups.push(`🟣Discord > 💬${discordChatters.join(', ')}`);
      }

      await reply(`@${userName} 🟢${liveMembers.length} live 💬${totalChatters} chatting: ${groups.join(' | ') || 'none'}`);
      return NextResponse.json({ success: true });
    }

    if (cmd === 'score' || cmd === 'rank') {
      const tagCounts: Record<string, { tags: number; tagged: number }> = {};
      const scoring = getScoringSettings(state);
      for (const entry of state.tagHistory || []) {
        if ((entry as any).blocked) continue;
        const from = (entry as any).taggerId || (entry as any).from;
        const to = (entry as any).taggedId || (entry as any).to;
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
        const filtered = allPlayers.filter((p: any) => (p.twitchUsername || '').toLowerCase() !== 'mtman1987');
        const top5 = filtered.slice(0, 5);
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
