import { readAppState, toMillis, updateAppState, type AppState } from '@/lib/volume-store';
import { getScoringSettings, scoreFromTagCounts } from '@/lib/scoring';

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const CHAT_TAG_CHANNEL_ID =
  process.env.CHAT_TAG_CHANNEL_ID ||
  process.env.DISCORD_CHAT_TAG_CHANNEL_ID ||
  process.env.DISCORD_TAG_CHANNEL_ID ||
  process.env.DISCORD_CHANNEL_ID ||
  '1463633163673927732';
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

export async function postOrUpdateChatTagEmbed() {
  const state = await readAppState();
  const gameState = buildGameStatePayload(state);
  const payload = buildChatTagEmbed(gameState);
  const stored = state.discordMessages?.chatTagPersistentEmbed as any;

  if (stored?.messageId && stored?.channelId) {
    try {
      await editDiscordMessage(stored.channelId, stored.messageId, payload);
      console.log('[ChatTagEmbed] Updated persistent embed:', stored.messageId);
      return { ok: true, action: 'updated', channelId: stored.channelId, messageId: stored.messageId };
    } catch (error: any) {
      console.warn(`[ChatTagEmbed] Stored embed update failed, posting replacement: ${error.message}`);
    }
  }

  const message = await sendDiscordChannelMessage(CHAT_TAG_CHANNEL_ID, payload);
  const messageId = message?.id;
  if (!messageId) {
    throw new Error('Discord did not return a message id for Chat Tag embed');
  }

  await updateAppState((draft) => {
    draft.discordMessages.chatTagPersistentEmbed = {
      channelId: CHAT_TAG_CHANNEL_ID,
      messageId,
      updatedAt: new Date().toISOString(),
    };
  });
  console.log('[ChatTagEmbed] Posted persistent embed:', messageId);
  return { ok: true, action: 'posted', channelId: CHAT_TAG_CHANNEL_ID, messageId };
}
