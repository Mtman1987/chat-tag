import { readAppState, toMillis, updateAppState, type AppState } from '@/lib/volume-store';
import { getScoringSettings, scoreFromTagCounts } from '@/lib/scoring';

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const DISCORD_WEBHOOK_URL =
  process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_TAG_WEBHOOK_URL || '';
const CHAT_TAG_WEBHOOK_NAME = process.env.CHAT_TAG_WEBHOOK_NAME || 'Chat Tag';
const CHAT_TAG_AVATAR_URL =
  process.env.CHAT_TAG_AVATAR_URL ||
  process.env.DISCORD_CHAT_TAG_AVATAR_URL ||
  '';
const CHAT_TAG_CHANNEL_ID =
  process.env.CHAT_TAG_CHANNEL_ID ||
  process.env.DISCORD_CHAT_TAG_CHANNEL_ID ||
  process.env.DISCORD_TAG_CHANNEL_ID ||
  process.env.DISCORD_CHANNEL_ID ||
  '1463633163673927732';
const DISCORD_CHANNEL_CLEANUP_LIMIT = Number(process.env.DISCORD_CHANNEL_CLEANUP_LIMIT || 5000);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUnknownDiscordMessageError(error: Error) {
  return /Discord request failed \(404\)|Unknown Message|code"?\s*:\s*10008/i.test(error.message || '');
}

function withChatTagWebhookIdentity(payload: Record<string, unknown>) {
  return {
    username: CHAT_TAG_WEBHOOK_NAME,
    ...(CHAT_TAG_AVATAR_URL ? { avatar_url: CHAT_TAG_AVATAR_URL } : {}),
    ...payload,
  };
}

function getWebhookMessageUrl(messageId?: string) {
  if (!DISCORD_WEBHOOK_URL) return '';
  const webhookUrl = new URL(DISCORD_WEBHOOK_URL);
  webhookUrl.search = '';
  webhookUrl.hash = '';
  return messageId ? `${webhookUrl.toString()}/messages/${messageId}` : webhookUrl.toString();
}

export function buildGameStatePayload(state: AppState) {
  const scoring = getScoringSettings(state);
  const tagCounts: Record<string, { tags: number; tagged: number }> = {};
  for (const entry of state.tagHistory || []) {
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

  const players = Object.values(state.tagPlayers || {}).map((p: any) => {
    const counts = tagCounts[p.id] || { tags: 0, tagged: 0 };
    const score = scoreFromTagCounts(counts, scoring) + (p.bingoPoints || 0);
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
      passCount: p.passCount || (p.hasPass ? 1 : 0),
      lastChatAt: p.lastChatAt || 0,
      lastSeenChannel: p.lastSeenChannel || null,
    };
  });

  const leaderboard = [...players]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ rank: i + 1, ...p }));

  const currentIt = players.find((p) => p.isIt);

  const recentHistory = [...(state.tagHistory || [])]
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
      currentIt: currentIt
        ? { id: currentIt.id, twitchUsername: currentIt.twitchUsername }
        : null,
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

export function buildChatTagEmbed(gameState: any) {
  const tag = gameState.tag || {};
  const leaderboard = gameState.leaderboard || [];
  const history = gameState.recentHistory || [];

  const itLine = tag.currentIt
    ? `🎯 **${tag.currentIt.twitchUsername}** is IT`
    : '🔥 **FREE FOR ALL** - Anyone can tag for DOUBLE POINTS!';
  const elapsed = tag.lastTagTime ? Math.floor((Date.now() - tag.lastTagTime) / 60000) : 0;
  const timeLine = tag.lastTagTime ? `⏱️ Last tag ${elapsed} min ago` : '⏱️ No tags yet';
  const recentLines =
    history
      .slice(0, 5)
      .map((h: any) => {
        const icon = h.blocked ? '🛡️' : h.doublePoints ? '🔥' : '🎯';
        if (h.blocked) return `${icon} ${h.taggerUsername} -> ${h.taggedUsername} (${h.blocked})`;
        return `${icon} ${h.taggerUsername} tagged ${h.taggedUsername}${h.doublePoints ? ' (2x)' : ''}`;
      })
      .join('\n') || 'No recent tags';

  const top3Lines =
    leaderboard
      .filter((p: any) => (p.twitchUsername || '').toLowerCase() !== 'mtman1987')
      .slice(0, 3)
      .map((p: any, i: number) => `**#${i + 1}** ${p.twitchUsername} - ${p.score} pts (${p.tags} tags)`)
      .join('\n') || 'No players yet';

  return {
    embeds: [
      {
        title: '🏷️ SPMT Chat Tag',
        description: `${itLine}\n${timeLine}`,
        color: tag.isFreeForAll ? 0xff4500 : 0x00d9ff,
        fields: [
          { name: '📜 Recent', value: recentLines, inline: false },
          { name: '🏆 Top 3', value: top3Lines, inline: true },
          { name: '📺 Overlay', value: '[Add to OBS](https://tinyurl.com/spmt-overlay)', inline: true },
        ],
        footer: { text: 'type spmt controls to interact with chat tag' },
        timestamp: new Date().toISOString(),
      },
    ],
    components: [],
    allowed_mentions: { parse: [] },
  };
}

async function requestDiscord(path: string, init: RequestInit) {
  if (!DISCORD_BOT_TOKEN) {
    throw new Error('DISCORD_BOT_TOKEN is not configured');
  }

  const response = await fetch(`${DISCORD_API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Discord request failed (${response.status}): ${text.slice(0, 300) || response.statusText}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function tryRequestDiscord(path: string, init: RequestInit) {
  try {
    return await requestDiscord(path, init);
  } catch (error: any) {
    return { error };
  }
}

export async function sendDiscordChannelMessage(channelId: string, payload: Record<string, unknown>) {
  return requestDiscord(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function editDiscordMessage(channelId: string, messageId: string, payload: Record<string, unknown>) {
  return requestDiscord(`/channels/${channelId}/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

async function sendDiscordWebhookMessage(payload: Record<string, unknown>) {
  if (!DISCORD_WEBHOOK_URL) {
    return sendDiscordChannelMessage(CHAT_TAG_CHANNEL_ID, payload);
  }

  const webhookUrl = new URL(DISCORD_WEBHOOK_URL);
  webhookUrl.searchParams.set('wait', 'true');
  const response = await fetch(webhookUrl.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withChatTagWebhookIdentity(payload)),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook post failed (${response.status}): ${await response.text().catch(() => '')}`);
  }

  return response.json();
}

async function editDiscordWebhookMessage(messageId: string, payload: Record<string, unknown>) {
  if (!DISCORD_WEBHOOK_URL) {
    return editDiscordMessage(CHAT_TAG_CHANNEL_ID, messageId, payload);
  }

  const response = await fetch(getWebhookMessageUrl(messageId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withChatTagWebhookIdentity(payload)),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook edit failed (${response.status}): ${await response.text().catch(() => '')}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function deleteDiscordMessage(channelId: string, messageId: string) {
  return requestDiscord(`/channels/${channelId}/messages/${messageId}`, {
    method: 'DELETE',
  });
}

async function listDiscordMessages(channelId: string, before?: string) {
  const query = new URLSearchParams({ limit: '100' });
  if (before) query.set('before', before);
  return requestDiscord(`/channels/${channelId}/messages?${query.toString()}`, {
    method: 'GET',
  });
}

async function deleteDiscordMessages(channelId: string, messageIds: string[]) {
  for (let index = 0; index < messageIds.length; index += 100) {
    const chunk = messageIds.slice(index, index + 100);
    if (chunk.length === 0) continue;

    if (chunk.length >= 2) {
      const result = await tryRequestDiscord(`/channels/${channelId}/messages/bulk-delete`, {
        method: 'POST',
        body: JSON.stringify({ messages: chunk }),
      });
      if (!result?.error) {
        await sleep(400);
        continue;
      }
      console.warn(`[ChatTagEmbed] Bulk delete failed, falling back to individual deletes: ${result.error.message}`);
    }

    for (const messageId of chunk) {
      try {
        await deleteDiscordMessage(channelId, messageId);
        await sleep(150);
      } catch (error: any) {
        if (!isUnknownDiscordMessageError(error)) {
          console.warn(`[ChatTagEmbed] Message cleanup failed for ${messageId}: ${error.message}`);
        }
      }
    }
  }
}

export async function wipeChatTagChannel(channelId = CHAT_TAG_CHANNEL_ID) {
  let before: string | undefined;
  let deleted = 0;

  while (deleted < DISCORD_CHANNEL_CLEANUP_LIMIT) {
    const messages = await listDiscordMessages(channelId, before);
    if (!Array.isArray(messages) || messages.length === 0) break;

    const ids = messages.map((message: any) => message?.id).filter(Boolean);
    if (ids.length === 0) break;

    await deleteDiscordMessages(channelId, ids);
    deleted += ids.length;
    before = ids[ids.length - 1];

    if (messages.length < 100) break;
  }

  console.log(`[ChatTagEmbed] Channel cleanup deleted ${deleted} message(s) from ${channelId}`);
  return { deleted, channelId };
}

export async function postOrUpdateChatTagEmbed() {
  const state = await readAppState();
  const gameState = buildGameStatePayload(state);
  const payload = buildChatTagEmbed(gameState);
  const stored = state.discordMessages?.chatTagPersistentEmbed as any;

  if (stored?.messageId && DISCORD_WEBHOOK_URL && stored.via !== 'webhook') {
    console.warn('[ChatTagEmbed] Stored persistent embed was bot-owned, wiping channel before webhook replacement');
    await wipeChatTagChannel(stored.channelId || CHAT_TAG_CHANNEL_ID);
    await updateAppState((draft) => {
      if (draft.discordMessages) {
        delete draft.discordMessages.chatTagPersistentEmbed;
      }
    });
  } else
  if (stored?.messageId && stored?.channelId) {
    try {
      await editDiscordWebhookMessage(stored.messageId, payload);
      console.log('[ChatTagEmbed] Updated persistent embed:', stored.messageId);
      return { ok: true, action: 'updated', channelId: stored.channelId, messageId: stored.messageId };
    } catch (error: any) {
      console.warn(`[ChatTagEmbed] Stored embed update failed, wiping channel before replacement: ${error.message}`);
      await wipeChatTagChannel(stored.channelId);
      await updateAppState((draft) => {
        if (draft.discordMessages) {
          delete draft.discordMessages.chatTagPersistentEmbed;
        }
      });
    }
  }

  const message = await sendDiscordWebhookMessage(payload);
  const messageId = message?.id;
  if (!messageId) {
    throw new Error('Discord did not return a message id for Chat Tag embed');
  }

  await updateAppState((draft) => {
    draft.discordMessages.chatTagPersistentEmbed = {
      channelId: CHAT_TAG_CHANNEL_ID,
      messageId,
      via: DISCORD_WEBHOOK_URL ? 'webhook' : 'bot',
      updatedAt: new Date().toISOString(),
    };
  });
  console.log('[ChatTagEmbed] Posted persistent embed:', messageId);
  return { ok: true, action: 'posted', channelId: CHAT_TAG_CHANNEL_ID, messageId };
}
