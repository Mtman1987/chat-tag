import { NextRequest, NextResponse } from 'next/server';
import { readAppState, updateAppState } from '@/lib/volume-store';
import { appendAdminHistory } from '@/lib/audit';
import { getScoringSettings, scoreFromTagCounts } from '@/lib/scoring';
import { quackverseCards } from '@/lib/quackverse-data';
import { getPublicAppOrigin } from '@/lib/public-origin';
import { getPlayerHelpText, getRulesText, getModHelpText } from '@/lib/chat-tag-command-text';
import { normalizeChatHandle, findTargetPlayer, findPlayerForDiscordUser } from '@/lib/chat-tag-player-lookup';

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
const ACTIVE_CHAT_MS = Number(process.env.AUTO_ROTATE_MINUTES || 4) * 60 * 1000;

function debugEnabled(scope: string) {
  const value = String(process.env.DEBUG || '').toLowerCase();
  if (!value) return false;
  const scopes = value.split(',').map((item) => item.trim()).filter(Boolean);
  return scopes.some((item) => item === '1' || item === 'true' || item === '*' || item === 'all' || item === scope);
}

function getInternalAppOrigin() {
  return process.env.INTERNAL_APP_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3000}`;
}

function getWebhookMessageUrl(messageId: string) {
  const url = new URL(DISCORD_WEBHOOK_URL);
  url.search = '';
  url.hash = '';
  return `${url.toString()}/messages/${messageId}`;
}

async function recordDiscordSendFailure(
  channelId: string,
  transport: 'webhook' | 'bot',
  status: number | string,
  detail = ''
) {
  await updateAppState((state) => {
    appendAdminHistory(state, {
      action: 'discord-send-failed',
      performedBy: 'discord-chat-route',
      targetUser: channelId || 'unknown-channel',
      details: `transport=${transport}; status=${status}; detail=${String(detail || '').slice(0, 180)}`,
    });
  }).catch((error) => {
    console.error('[Discord Chat] Failed to record send failure:', error);
  });
}

function parseJsonText(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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

async function sendDiscordPayload(channelId: string, payload: any) {
  if (CHAT_TAG_AVATAR_URL && !payload.avatar_url) payload.avatar_url = CHAT_TAG_AVATAR_URL;

  if (DISCORD_WEBHOOK_URL) {
    const webhookUrl = new URL(DISCORD_WEBHOOK_URL);
    webhookUrl.searchParams.set('wait', 'true');
    try {
      const webhookRes = await fetch(webhookUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const text = await webhookRes.text().catch(() => '');
      if (!webhookRes.ok) {
        console.error(`[Discord Chat] Failed to send webhook reply: ${webhookRes.status} ${text}`);
        await recordDiscordSendFailure(channelId, 'webhook', webhookRes.status, text);
      }
      const sent = parseJsonText(text);
      if (sent?.id) {
        setTimeout(() => {
          fetch(getWebhookMessageUrl(sent.id), { method: 'DELETE' }).catch(() => {});
        }, CLEANUP_DELAY_MS);
      }
      return webhookRes;
    } catch (error: any) {
      console.error('[Discord Chat] Failed to send webhook reply:', error);
      await recordDiscordSendFailure(channelId, 'webhook', 'network', error?.message || String(error));
      throw error;
    }
  }

  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      console.error(`[Discord Chat] Failed to send reply: ${res.status} ${text}`);
      await recordDiscordSendFailure(channelId, 'bot', res.status, text);
    }
    const sent = parseJsonText(text);
    if (sent?.id) {
      setTimeout(() => {
        deleteDiscordMessage(channelId, sent.id).catch(() => {});
      }, CLEANUP_DELAY_MS);
    }
    return res;
  } catch (error: any) {
    console.error('[Discord Chat] Failed to send reply:', error);
    await recordDiscordSendFailure(channelId, 'bot', 'network', error?.message || String(error));
    throw error;
  }
}

async function sendDiscordReply(channelId: string, content: string) {
  return sendDiscordPayload(channelId, {
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
  });
}

function crownPlayerName(name: string, winners: any[] = []) {
  const winner = winners.find((entry: any) => normalizeChatHandle(entry.username) === normalizeChatHandle(name));
  return winner ? `${name} 👑#${winner.place}` : name;
}

function rarityBreakdown(cardIds: number[] = []) {
  const counts: Record<string, number> = {};
  for (const id of cardIds) {
    const card = quackverseCards.find((item) => item.id === Number(id));
    const rarity = card?.rarity || 'Unknown';
    counts[rarity] = (counts[rarity] || 0) + 1;
  }

  const order = ['Legendary', 'Epic', 'Rare', 'Uncommon', 'Common', 'Unknown'];
  return order
    .filter((rarity) => counts[rarity])
    .map((rarity) => `${rarity}: ${counts[rarity]}`)
    .join(' | ') || 'No cards yet';
}

async function sendDiscordPackReply(
  req: NextRequest,
  channelId: string,
  userName: string,
  packData: any,
) {
  const packCards = Array.isArray(packData.pack) ? packData.pack : [];
  const packNames = packCards.map((card: any) => card?.name).filter(Boolean).slice(0, 5).join(', ') || 'pack opened';
  const packIds = packCards.map((card: any) => Number(card?.id)).filter((id: number) => Number.isFinite(id) && id > 0).slice(0, 5);
  const collectionIds = Array.isArray(packData.cards) ? packData.cards.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id)) : [];
  const uniqueCards = new Set(collectionIds).size;
  const previewUrl = packIds.length > 0
    ? `${getPublicAppOrigin(req)}/api/quackverse/pack-preview?ids=${packIds.join(',')}&t=${Date.now()}`
    : '';

  const embed: any = {
    title: 'Quackverse Pack Opened',
    description: `🦆 @${userName} opened a Quackverse pack: ${packNames}. ${Number(packData.packsRemaining || 0)}/3 packs left today.`,
    color: 0x00d9ff,
    fields: [
      {
        name: 'Pack',
        value: packCards.map((card: any) => `${card?.name || 'Unknown'} (${card?.rarity || 'Unknown'})`).join('\n') || 'No cards returned.',
        inline: false,
      },
      {
        name: 'Collection',
        value: `${collectionIds.length} total cards | ${uniqueCards} unique`,
        inline: false,
      },
      {
        name: 'Rarity Breakdown',
        value: rarityBreakdown(collectionIds),
        inline: false,
      },
    ],
    footer: { text: 'SPMT Chat Tag' },
    timestamp: new Date().toISOString(),
  };
  if (previewUrl) embed.image = { url: previewUrl };

  return sendDiscordPayload(channelId, {
    username: CHAT_TAG_WEBHOOK_NAME,
    allowed_mentions: { parse: [] },
    embeds: [embed],
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
    if (debugEnabled('discord-chat') || debugEnabled('discord')) {
      console.log('[Discord Chat] Raw payload keys', {
        keys: Object.keys(body || {}),
        rootKeys: body?.root ? Object.keys(body.root || {}) : [],
      });
    }

    // Support Kite/root-wrapped payloads, direct payloads, and older field names.
    const data = body?.root || body || {};
    const discordUserId = data.userId || data.discordUserId;
    const message = data.message || data.content || '';
    const rawUserName = data.userName || data.displayName || data.username;
    const channelId = data.channelId || '';
    const messageId = data.messageId || data.userMessageId || '';
    const userName = rawUserName || 'Unknown';

    if (!message && channelId) {
      return NextResponse.json({ success: true, skipped: 'empty-message' });
    }

    if (!message || !channelId) {
      console.warn('[Discord Chat] Missing required Discord chat fields', {
        hasMessage: Boolean(message),
        hasChannelId: Boolean(channelId),
        keys: Object.keys(data || {}),
      });
      return NextResponse.json({ error: 'message and channelId required' }, { status: 400 });
    }

    // Check if it's an spmt command
    const rawMessage = message.trim();
    const msg = rawMessage.toLowerCase();
    if (debugEnabled('discord-chat') || debugEnabled('discord')) {
      console.log('[Discord Chat] Received message', {
        command: msg.startsWith('spmt ') || msg.startsWith('@spmt '),
        channelId,
        messageId,
        userName,
      });
    }

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
    if (debugEnabled('discord-chat') || debugEnabled('discord')) console.log(`[Discord Chat] Processing spmt ${cmd || '(empty)'}`);

    if (cmd === 'controls' || cmd === 'control') {
      return NextResponse.json({ success: true, skipped: 'controls-owned-by-dsh' });
    }

    await deleteDiscordMessage(channelId, messageId);

    if (cmd === 'card' || cmd === 'phrases' || cmd === 'claim' || cmd === 'newcard' || cmd === 'share' || cmd === 'export') {
      return NextResponse.json({ success: true, skipped: 'deprecated-bingo-command' });
    }

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

    if (cmd === 'optout') {
      await deleteDiscordMessage(channelId, messageId);
      await reply(`@${userName} Opt-out is Twitch-channel only. Use "spmt optout" in the Twitch channel you want removed.`);
      return NextResponse.json({ success: true, reply: 'twitch-only' });
    }

    // All other commands require being in the game
    if (!player || !gameUserId) {
      await reply(`@${userName} You're not linked to a Chat Tag player yet. Use the Twitch link button in Mountaineer Launch, then try again.`);
      return NextResponse.json({ success: true, reply: 'not-in-game' });
    }

    if (cmd === 'leave') {
      const leaveRes = await fetch(`${getInternalAppOrigin()}/api/tag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bot-secret': process.env.BOT_SECRET_KEY || '1234' },
        body: JSON.stringify({ action: 'leave', userId: gameUserId, performedBy: userName }),
      }).catch((error) => {
        console.error('[Discord Chat] Leave failed:', error);
        return null;
      });
      if (!leaveRes?.ok) {
        await reply(`@${userName} Could not leave the tag game right now.`);
        return NextResponse.json({ success: true, reply: 'leave-failed' });
      }
      await reply(`@${userName} left the tag game.`);
      return NextResponse.json({ success: true });
    }

    if (cmd === 'tag') {
      const target = normalizeChatHandle(args[1]);
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
      const target = normalizeChatHandle(args[1]);
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
        const itName = itPlayer.twitchUsername || itPlayer.username || 'someone';
        await reply(`🏷️ Current IT: ${itName}. ${itName} must tag someone next; everyone else, stay alive.`);
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

    if (cmd === 'pack' || cmd === 'quackpack') {
      const packRes = await fetch(`${getInternalAppOrigin()}/api/quackverse/pack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-bot-secret': process.env.BOT_SECRET_KEY || '1234',
        },
        body: JSON.stringify({
          action: 'open',
          userId: gameUserId,
          twitchUsername: player.twitchUsername || player.username || userName,
          source: 'discord',
          channelId,
          messageId,
        }),
      }).catch((error) => {
        console.error('[Discord Chat] Pack open failed:', error);
        return null;
      });

      if (!packRes) {
        await reply(`@${userName} Could not open a Quackverse pack right now.`);
        return NextResponse.json({ success: true, reply: 'pack-failed' });
      }

      const packData = await packRes.json().catch(() => ({}));
      if (!packRes.ok || packData.error) {
        await reply(`@${userName} ${packData.error || 'Could not open a Quackverse pack.'} ${Number(packData.packsRemaining || 0)}/3 packs left today.`);
        return NextResponse.json({ success: true, reply: 'pack-error' });
      }

      await sendDiscordPackReply(req, channelId, userName, packData);
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
        const winners = (state.tagGame?.state?.monthlyWinners || []) as any[];
        const filtered = allPlayers.filter((p: any) => (p.twitchUsername || '').toLowerCase() !== 'mtman1987');
        const top3 = filtered.slice(0, 3);
        const lines = top3
          .map((p, i) => `#${i + 1} ${crownPlayerName(p.twitchUsername || p.username || 'unknown', winners)} - ${p.score || 0} pts`)
          .join('\n');
        const winnerLine = winners.length > 0
          ? `\n\nLast month's crowns: ${winners.map((w: any) => `👑#${w.place} ${w.username}`).join(' | ')}`
          : '';
        await reply(`🏆 Top 3\n${lines || 'No ranked players yet.'}${winnerLine}\n\nFull leaderboard: https://chat-tag-new.fly.dev/`);
      }
      return NextResponse.json({ success: true });
    }

    if (cmd === 'players') {
      const players = Object.values(state.tagPlayers || {}) as any[];
      const liveRes = await fetch(`${getInternalAppOrigin()}/api/discord/live-members`, {
        cache: 'no-store',
      }).catch(() => null);
      const liveData = liveRes?.ok ? await liveRes.json().catch(() => ({})) : {};
      const playerSet = new Set(
        players.map((p: any) => (p.twitchUsername || p.username || '').toLowerCase()).filter(Boolean)
      );
      const twitchLiveCount = (liveData.liveMembers || []).filter((member: any) =>
        playerSet.has(String(member.twitchUsername || '').toLowerCase())
      ).length;
      const now = Date.now();
      const discordOnlineCount = players.filter((p: any) => {
        const seenChannel = String(p.lastSeenChannel || '').toLowerCase();
        const lastChat = Number(p.lastChatAt || 0);
        return seenChannel === 'discord' && lastChat && now - lastChat <= ACTIVE_CHAT_MS;
      }).length;
      await reply(`@${userName} ${players.length} players in the game, ${twitchLiveCount} live on Twitch, ${discordOnlineCount} online on Discord.`);
      return NextResponse.json({ success: true });
    }

    if (cmd === 'more') {
      await reply(`@${userName} Pagination is available in Twitch chat right now. Use "spmt players" or "spmt live" here for the current snapshot.`);
      return NextResponse.json({ success: true });
    }

    if (cmd === 'sleep' || cmd === 'wake') {
      await reply(`@${userName} "${cmd}" is now "away". Use "spmt away" to toggle.`);
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

    if (cmd === 'rules') {
      await reply(`@${userName} ${getRulesText()}`);
      return NextResponse.json({ success: true });
    }

    if (cmd === 'pinrank') {
      const pinRes = await fetch(`${getInternalAppOrigin()}/api/tag/pin-stats`, {
        cache: 'no-store',
      }).catch((error) => {
        console.error('[Discord Chat] Pin rank failed:', error);
        return null;
      });
      const pinData = pinRes?.ok ? await pinRes.json().catch(() => ({})) : {};
      if (!pinData?.topTagged || pinData.topTagged.length === 0) {
        await reply(`@${userName} Pin hasn't tagged anyone yet.`);
        return NextResponse.json({ success: true });
      }
      const top5 = pinData.topTagged
        .slice(0, 5)
        .map((entry: any, i: number) => `#${i + 1} ${entry.username}: ${entry.count}`)
        .join('\n');
      await reply(`Pin's Top 5\n${top5}`);
      return NextResponse.json({ success: true });
    }

    if (cmd === 'admin' || cmd === 'mod') {
      await reply(`@${userName} ${getModHelpText('spmt', 'discord')}`);
      return NextResponse.json({ success: true });
    }

    if (cmd === 'support' || cmd === 'ticket') {
      const note = args.slice(1).join(' ').trim();
      if (!note) {
        await reply(`@${userName} Please describe what is going on so I can open a useful ticket. Type: "spmt ${cmd} <description>". Include what broke, where it happened, and what you expected.`);
        return NextResponse.json({ success: true, reply: 'ticket-needs-description' });
      }
      const ticketRes = await fetch(`${getInternalAppOrigin()}/api/discord/help-ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bot-secret': process.env.BOT_SECRET_KEY || '1234' },
        body: JSON.stringify({
          requester: displayName,
          requesterId: gameUserId,
          channel: 'discord',
          note,
        }),
      }).catch((error) => {
        console.error('[Discord Chat] Support ticket failed:', error);
        return null;
      });
      if (!ticketRes?.ok) {
        await reply(`@${userName} Could not create a support ticket right now.`);
        return NextResponse.json({ success: true, reply: 'ticket-failed' });
      }
      await reply(`@${userName} Support ticket created.`);
      return NextResponse.json({ success: true });
    }

    if (cmd === 'givepass') {
      const target = normalizeChatHandle(args[1]);
      if (!target) {
        await reply(`@${userName} Usage: "spmt givepass @username"`);
        return NextResponse.json({ success: true });
      }
      const targetPlayer = findTargetPlayer(players, args[1]);
      if (!targetPlayer) {
        await reply(`@${userName} Player "${target}" not found!`);
        return NextResponse.json({ success: true });
      }
      const targetName = targetPlayer.twitchUsername || targetPlayer.username || target;
      const grantRes = await fetch(`${getInternalAppOrigin()}/api/tag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bot-secret': process.env.BOT_SECRET_KEY || '1234' },
        body: JSON.stringify({ action: 'grant-pass', userId: targetPlayer.id, twitchUsername: targetName, reason: `gifted by ${displayName}` }),
      }).catch((error) => {
        console.error('[Discord Chat] Give pass failed:', error);
        return null;
      });
      const grantData = grantRes?.ok ? await grantRes.json().catch(() => ({})) : {};
      if (grantData.granted) {
        await reply(`🎟️ @${targetName} got an SPMT Pass from ${displayName}. Use "spmt pass @username" to tag anyone for double points.`);
      } else if (grantData.reason === 'max-passes') {
        await reply(`@${userName} ${targetName} already has the max 3/3 passes.`);
      } else {
        await reply(`@${userName} ${targetName} already has a pass or is not in the game.`);
      }
      return NextResponse.json({ success: true });
    }

    if (cmd === 'mute' || cmd === 'unmute' || cmd === 'kick') {
      await reply(`@${userName} "${cmd}" is Twitch-only.`);
      return NextResponse.json({ success: true });
    }

    if (cmd === 'twitch' || cmd === 'discord') {
      await reply(`@${userName} Account linking is handled by the Twitch link button in Mountaineer Launch.`);
      return NextResponse.json({ success: true });
    }

    if (cmd === 'help') {
      await reply(`@${userName} Commands: ${getPlayerHelpText()}`);
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
