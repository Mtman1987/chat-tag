import { readAppState, toMillis, updateAppState, type AppState } from '@/lib/volume-store';
import { getScoringSettings, scoreFromTagCounts } from '@/lib/scoring';
import { applyCrownsToDiscordPayload } from '@/lib/discord-webhooks';
import { getPublicAppOrigin } from '@/lib/public-origin';

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const DISCORD_WEBHOOK_URL =
  process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_TAG_WEBHOOK_URL || '';
const CHAT_TAG_WEBHOOK_NAME = process.env.NEBULA_ARCADE_WEBHOOK_NAME || 'Nebula Arcade';
const CHAT_TAG_AVATAR_URL =
  process.env.NEBULA_ARCADE_AVATAR_URL ||
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
export const NEBULA_ARCADE_EMBED_REVISION = 2;
export const NEBULA_GAMEPLAY_ROTATION_MS = 10 * 60 * 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUnknownDiscordMessageError(error: Error) {
  return /Discord request failed \(404\)|Unknown Message|code"?\s*:\s*10008/i.test(error.message || '');
}

function nebulaArcadeUrl(pathname: string, publicOrigin = getPublicAppOrigin()) {
  try {
    return new URL(pathname, publicOrigin).toString();
  } catch {
    return '';
  }
}

export function nebulaGameplayImageUrl(now = Date.now()) {
  const dshOrigin = process.env.DSH_API_BASE || 'https://discord-stream-hub-new.fly.dev';
  try {
    const url = new URL('/api/nebula-arcade/gameplay/current.gif', dshOrigin);
    url.searchParams.set('slot', String(Math.floor(now / NEBULA_GAMEPLAY_ROTATION_MS)));
    return url.toString();
  } catch {
    return '';
  }
}

function withChatTagWebhookIdentity(payload: Record<string, unknown>) {
  const avatarUrl = CHAT_TAG_AVATAR_URL || nebulaArcadeUrl('/brand/chat-tag-icon-512.png');
  return {
    username: CHAT_TAG_WEBHOOK_NAME,
    ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
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

  const sortedTagHistory = [...(state.tagHistory || [])]
    .sort((a: any, b: any) => (toMillis(b.timestamp) || 0) - (toMillis(a.timestamp) || 0));
  const storedAnnouncements = Array.isArray(state.discordMessages?.announcements)
    ? state.discordMessages.announcements
    : [];
  const derivedAnnouncements = sortedTagHistory
    .filter((entry: any) => !entry.blocked)
    .slice(0, 3)
    .map((entry: any, index: number) => {
      const taggerId = entry.taggerId || entry.from;
      const taggedId = entry.taggedId || entry.to;
      const tagger = state.tagPlayers[taggerId];
      const tagged = state.tagPlayers[taggedId];
      const taggerUsername = tagger?.twitchUsername || taggerId || 'Someone';
      const taggedUsername = tagged?.twitchUsername || taggedId || 'someone';
      return {
        id: `history_${toMillis(entry.timestamp) || index}`,
        title: entry.doublePoints ? '🔥 Double-Points Tag' : '🎯 New Tag',
        description: `**${taggerUsername}** tagged **${taggedUsername}**${entry.doublePoints ? ' for **DOUBLE POINTS**' : ''}.`,
        details: [`**Now IT:** ${taggedUsername}`],
        kind: entry.doublePoints ? 'double-points-tag' : 'tag',
        timestamp: entry.timestamp,
      };
    });
  const recentAnnouncements = [...(storedAnnouncements.length > 0 ? storedAnnouncements : derivedAnnouncements)]
    .sort((a: any, b: any) => (toMillis(b.timestamp) || 0) - (toMillis(a.timestamp) || 0))
    .slice(0, 3)
    .map((announcement: any) => ({
      id: announcement.id || '',
      title: announcement.title || 'Chat Tag Update',
      description: announcement.description || announcement.message || '',
      details: Array.isArray(announcement.details) ? announcement.details : [],
      kind: announcement.kind || 'update',
      timestamp: toMillis(announcement.timestamp) || Date.now(),
    }));

  const recentHistory = sortedTagHistory
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
        ? {
            id: currentIt.id,
            twitchUsername: currentIt.twitchUsername,
            avatarUrl: currentIt.avatarUrl || '',
          }
        : null,
      isFreeForAll: !currentIt,
      lastTagTime: toMillis(state.tagGame.state.lastTagTime),
      playerCount: players.length,
    },
    players,
    leaderboard,
    recentAnnouncements,
    recentHistory,
    bingo,
    timestamp: Date.now(),
  };
}

export function buildChatTagEmbed(gameState: any, publicOrigin = getPublicAppOrigin()) {
  const tag = gameState.tag || {};
  const leaderboard = gameState.leaderboard || [];
  const announcements = gameState.recentAnnouncements || [];
  const history = gameState.recentHistory || [];
  const gamesUrl = nebulaArcadeUrl('/games', publicOrigin);
  const iconUrl = nebulaArcadeUrl('/brand/chat-tag-icon-512.png', publicOrigin);
  const showcaseUrl = nebulaGameplayImageUrl();

  const taggedAt = Number(tag.lastTagTime || 0);
  const taggedAtUnix = taggedAt > 0 ? Math.floor(taggedAt / 1000) : 0;
  const currentTagValue = tag.currentIt
    ? [
        `**${tag.currentIt.twitchUsername} is IT**`,
        `${taggedAtUnix ? `<t:${taggedAtUnix}:R>` : 'Time unavailable'} · ${Number(tag.playerCount || 0)} players`,
      ].join('\n')
    : [
        '**FREE FOR ALL**',
        `2× points · ${taggedAtUnix ? `last tag <t:${taggedAtUnix}:R>` : 'no tags yet'} · ${Number(tag.playerCount || 0)} players`,
      ].join('\n');
  const announcementFields = Array.from({ length: 3 }, (_, index) => {
    const announcement = announcements[index];
    if (!announcement) {
      return {
        name: index === 0 ? '📣 Latest Update' : index === 1 ? '📢 Previous Update' : '🗂️ Earlier Update',
        value: index === 0 ? 'No announcements yet.' : 'No earlier update.',
        inline: true,
      };
    }
    const timestamp = Number(announcement.timestamp || 0);
    const unix = timestamp > 0 ? Math.floor(timestamp / 1000) : 0;
    const value = [
      String(announcement.description || 'Chat Tag was updated.'),
      unix ? `🕒 <t:${unix}:R>` : '',
    ].filter(Boolean).join('\n').slice(0, 240);
    return {
      name: index === 0
        ? `📣 Latest · ${announcement.title || 'Update'}`.slice(0, 60)
        : index === 1
          ? `📢 ${announcement.title || 'Previous Update'}`.slice(0, 60)
          : `🗂️ ${announcement.title || 'Earlier Update'}`.slice(0, 60),
      value,
      inline: true,
    };
  });
  const recentLines =
    history
      .slice(0, 3)
      .map((h: any) => {
        const icon = h.blocked ? '🛡️' : h.doublePoints ? '🔥' : '🎯';
        if (h.blocked) return `${icon} ${h.taggerUsername} → ${h.taggedUsername} · blocked`;
        return `${icon} ${h.taggerUsername} → ${h.taggedUsername}${h.doublePoints ? ' · 2×' : ''}`;
      })
      .join('\n') || 'No recent tags';

  const top3Lines =
    leaderboard
      .filter((p: any) => (p.twitchUsername || '').toLowerCase() !== 'mtman1987')
      .slice(0, 3)
      .map((p: any, i: number) => `${['🥇', '🥈', '🥉'][i]} ${p.twitchUsername} · ${p.score}`)
      .join('\n') || 'No players yet';

  return {
    embeds: [
      {
        title: '🎮 Nebula Arcade · Chat Tag Live',
        ...(gamesUrl ? { url: gamesUrl } : {}),
        description: 'One bot · 20 equal games · live community status',
        color: tag.isFreeForAll ? 0xff4500 : 0x00d9ff,
        fields: [
          { name: '🎯 Current Tag', value: currentTagValue, inline: true },
          { name: '📜 Recent Tags', value: recentLines, inline: true },
          { name: '🏆 Top 3', value: top3Lines, inline: true },
          ...announcementFields,
        ],
        author: {
          name: 'Nebula Arcade · 20 Games',
          ...(iconUrl ? { icon_url: iconUrl } : {}),
        },
        ...(showcaseUrl ? { image: { url: showcaseUrl } } : {}),
        ...(tag.currentIt?.avatarUrl ? { thumbnail: { url: tag.currentIt.avatarUrl } } : {}),
        footer: { text: 'Nebula Arcade · type spmt controls to play Chat Tag' },
        timestamp: new Date().toISOString(),
      },
    ],
    components: gamesUrl
      ? [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: 'Open all 20 games',
                emoji: { name: '🎮' },
                url: gamesUrl,
              },
            ],
          },
        ]
      : [],
    allowed_mentions: { parse: [] },
  };
}

export function shouldReplacePersistentChatTagEmbed(stored: any) {
  return Boolean(stored?.messageId) && Number(stored?.embedRevision || 0) < NEBULA_ARCADE_EMBED_REVISION;
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
  const crownedPayload = await applyCrownsToDiscordPayload(payload);
  return requestDiscord(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify(crownedPayload),
  });
}

async function editDiscordMessage(channelId: string, messageId: string, payload: Record<string, unknown>) {
  const crownedPayload = await applyCrownsToDiscordPayload(payload);
  return requestDiscord(`/channels/${channelId}/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify(crownedPayload),
  });
}

async function sendDiscordWebhookMessage(payload: Record<string, unknown>) {
  if (!DISCORD_WEBHOOK_URL) {
    return sendDiscordChannelMessage(CHAT_TAG_CHANNEL_ID, payload);
  }

  const crownedPayload = await applyCrownsToDiscordPayload(payload);
  const webhookUrl = new URL(DISCORD_WEBHOOK_URL);
  webhookUrl.searchParams.set('wait', 'true');
  const response = await fetch(webhookUrl.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withChatTagWebhookIdentity(crownedPayload)),
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

  const crownedPayload = await applyCrownsToDiscordPayload(payload);
  const response = await fetch(getWebhookMessageUrl(messageId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withChatTagWebhookIdentity(crownedPayload)),
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

async function deletePersistentChatTagMessage(stored: any) {
  if (DISCORD_WEBHOOK_URL && stored?.via === 'webhook') {
    const response = await fetch(getWebhookMessageUrl(stored.messageId), { method: 'DELETE' });
    if (response.ok || response.status === 404) return;
    console.warn(`[ChatTagEmbed] Webhook replacement delete failed (${response.status}); trying bot delete`);
  }
  await deleteDiscordMessage(stored.channelId || CHAT_TAG_CHANNEL_ID, stored.messageId);
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
  let stored = state.discordMessages?.chatTagPersistentEmbed as any;

  if (shouldReplacePersistentChatTagEmbed(stored)) {
    console.log('[ChatTagEmbed] Replacing legacy persistent message to apply Nebula Arcade identity');
    await deletePersistentChatTagMessage(stored);
    await updateAppState((draft) => {
      if (draft.discordMessages) delete draft.discordMessages.chatTagPersistentEmbed;
    });
    stored = null;
  }

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
      embedRevision: NEBULA_ARCADE_EMBED_REVISION,
      updatedAt: new Date().toISOString(),
    };
  });
  console.log('[ChatTagEmbed] Posted persistent embed:', messageId);
  return { ok: true, action: 'posted', channelId: CHAT_TAG_CHANNEL_ID, messageId };
}
