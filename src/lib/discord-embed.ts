import { readAppState, updateAppState, toMillis } from '@/lib/volume-store';
import { getScoringSettings, scoreFromTagCounts } from '@/lib/scoring';

const DISCORD_BOT_TOKEN = () => process.env.DISCORD_BOT_TOKEN || '';
const CHAT_TAG_CHANNEL_ID = () =>
  process.env.CHAT_TAG_CHANNEL_ID ||
  process.env.DISCORD_TAG_CHANNEL_ID ||
  '';

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

// ── Game state payload (same shape used by /api/discord/game-state) ──

export function buildGameStatePayload(state: any) {
  const scoring = getScoringSettings(state);
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

  const players = Object.values(state.tagPlayers).map((p: any) => {
    const counts = tagCounts[p.id] || { tags: 0, tagged: 0 };
    const score = scoreFromTagCounts(counts, scoring) + (p.bingoPoints || 0);
    return {
      id: p.id,
      twitchUsername: p.twitchUsername || p.username,
      score,
      tags: counts.tags,
      tagged: counts.tagged,
      isIt: Boolean(p.isIt),
      sleepingImmunity: Boolean(p.sleepingImmunity),
      offlineImmunity: Boolean(p.offlineImmunity),
      hasPass: Boolean(p.hasPass),
    };
  });

  const leaderboard = [...players]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ rank: i + 1, ...p }));

  const currentIt = players.find((p) => p.isIt);

  const recentHistory = [...state.tagHistory]
    .sort(
      (a: any, b: any) =>
        (toMillis(b.timestamp) || 0) - (toMillis(a.timestamp) || 0),
    )
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
    timestamp: Date.now(),
  };
}

// ── Discord embed builder ──

export function buildGameStateEmbed(gameState: ReturnType<typeof buildGameStatePayload>) {
  const { tag, leaderboard, recentHistory } = gameState;

  const itLine = tag.currentIt
    ? `🎯 **${tag.currentIt.twitchUsername}** is IT`
    : `🔥 **FREE FOR ALL** — Anyone can tag for DOUBLE POINTS!`;

  const elapsed = tag.lastTagTime
    ? Math.floor((Date.now() - tag.lastTagTime) / 60000)
    : 0;
  const timeLine = tag.lastTagTime ? `⏱️ ${elapsed} min ago` : '';

  const recentLines =
    recentHistory
      .slice(0, 5)
      .map((h) => {
        const icon = h.blocked ? '🛡️' : h.doublePoints ? '🔥' : '🎯';
        if (h.blocked)
          return `${icon} ${h.taggerUsername} → ${h.taggedUsername} (blocked: ${h.blocked})`;
        return `${icon} ${h.taggerUsername} tagged ${h.taggedUsername}${h.doublePoints ? ' (2x!)' : ''}`;
      })
      .join('\n') || 'No recent tags';

  const filteredLeaderboard = leaderboard.filter(
    (p) => (p.twitchUsername || '').toLowerCase() !== 'mtman1987',
  );

  const top3Lines =
    filteredLeaderboard
      .slice(0, 3)
      .map(
        (p, i) =>
          `**#${i + 1}** ${p.twitchUsername} — ${p.score} pts (${p.tags} tags)`,
      )
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
          {
            name: '📺 Overlay',
            value: '[Add to OBS](https://tinyurl.com/spmt-overlay)',
            inline: true,
          },
        ],
        footer: {
          text: `${tag.playerCount} players • Type spmt help for commands`,
        },
        timestamp: new Date().toISOString(),
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 3, label: 'Join Game', custom_id: 'chattag_join' },
          { type: 2, style: 1, label: 'Status', custom_id: 'chattag_status' },
          { type: 2, style: 1, label: 'My Score', custom_id: 'chattag_score' },
          { type: 2, style: 4, label: 'Away', custom_id: 'chattag_togglesleep' },
          { type: 2, style: 2, label: 'Refresh', custom_id: 'chattag_refresh' },
        ],
      },
    ],
  };
}

// ── Discord API helpers ──

async function postDiscordMessage(
  channelId: string,
  payload: Record<string, unknown>,
): Promise<string | null> {
  const token = DISCORD_BOT_TOKEN();
  if (!token) {
    console.error('[DiscordEmbed] DISCORD_BOT_TOKEN is not set');
    return null;
  }
  const res = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: timeoutSignal(10_000),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(
      `[DiscordEmbed] Post failed (${res.status}): ${text.slice(0, 300)}`,
    );
    return null;
  }
  const data = await res.json();
  return data.id || null;
}

async function editDiscordMessage(
  channelId: string,
  messageId: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const token = DISCORD_BOT_TOKEN();
  if (!token) {
    console.error('[DiscordEmbed] DISCORD_BOT_TOKEN is not set');
    return false;
  }
  const res = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: timeoutSignal(10_000),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(
      `[DiscordEmbed] Edit failed (${res.status}): ${text.slice(0, 300)}`,
    );
    return false;
  }
  return true;
}

// ── Public: post or update the persistent game embed ──

export async function postOrUpdateGameEmbed(): Promise<{
  action: 'updated' | 'posted' | 'skipped';
  messageId: string | null;
}> {
  const channelId = CHAT_TAG_CHANNEL_ID();
  if (!channelId) {
    console.warn('[DiscordEmbed] No CHAT_TAG_CHANNEL_ID configured — skipping embed');
    return { action: 'skipped', messageId: null };
  }

  const state = await readAppState();
  const gameState = buildGameStatePayload(state);
  const embedPayload = buildGameStateEmbed(gameState);

  const storedMessageId = state.discordMessages?.embedMessageId;
  const storedChannelId = state.discordMessages?.embedChannelId;

  if (storedMessageId && storedChannelId === channelId) {
    const edited = await editDiscordMessage(channelId, storedMessageId, embedPayload);
    if (edited) {
      console.log('[DiscordEmbed] Updated persistent embed:', storedMessageId);
      return { action: 'updated', messageId: storedMessageId };
    }
    console.log('[DiscordEmbed] Edit failed, posting new embed');
  }

  const newMessageId = await postDiscordMessage(channelId, embedPayload);
  if (newMessageId) {
    await updateAppState((s) => {
      s.discordMessages.embedMessageId = newMessageId;
      s.discordMessages.embedChannelId = channelId;
    });
    console.log('[DiscordEmbed] Posted new persistent embed:', newMessageId);
    return { action: 'posted', messageId: newMessageId };
  }

  console.error('[DiscordEmbed] Failed to post embed');
  return { action: 'skipped', messageId: null };
}
