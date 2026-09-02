import { NextRequest, NextResponse } from 'next/server';
import { isBotRequest } from '@/lib/auth';
import { editDiscordSentMessage } from '@/lib/discord-message-edit';
import { scheduleDiscordMessageCleanup, sendDiscordMessage } from '@/lib/discord-webhooks';
import {
  createQuackversePackMediaEvent,
  queueQuackversePackGif,
  waitForQuackversePackGifResult,
} from '@/lib/quackverse-pack-media';

export const dynamic = 'force-dynamic';

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const CLEANUP_DELAY_MS = 10 * 60 * 1000;
const CHAT_TAG_WEBHOOK_NAME = process.env.NEBULA_ARCADE_WEBHOOK_NAME || 'Nebula Arcade';
const CHAT_TAG_CHANNEL_ID = String(
  process.env.CHAT_TAG_CHANNEL_ID
    || process.env.DISCORD_CHAT_TAG_CHANNEL_ID
    || process.env.DISCORD_TAG_CHANNEL_ID
    || process.env.DISCORD_CHANNEL_ID
    || '1463633163673927732',
).trim();

function finiteIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map(Number).filter(Number.isFinite);
}

function rarityBreakdown(cards: any[]) {
  const counts: Record<string, number> = {};
  for (const card of cards) {
    const rarity = String(card?.rarity || 'Unknown');
    counts[rarity] = (counts[rarity] || 0) + 1;
  }
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([rarity, count]) => `${rarity}: ${count}`)
    .join(' | ') || 'Unknown';
}

function buildPackEmbed(input: {
  username: string;
  pack: any[];
  packsRemaining: number;
  collectionIds: number[];
  gifUrl?: string;
  animationUnavailable?: boolean;
}) {
  const packNames = input.pack.map((card) => card?.name).filter(Boolean).slice(0, 5).join(', ') || 'pack opened';
  const packLines = input.pack
    .slice(0, 5)
    .map((card) => `${card?.name || 'Unknown'} (${card?.rarity || 'Unknown'})`)
    .join('\n') || 'No cards returned.';
  const uniqueCards = new Set(input.collectionIds).size;
  const description = [
    `🦆 @${input.username} opened a Quackverse pack: ${packNames}. ${input.packsRemaining}/3 packs left today.`,
    input.animationUnavailable ? '🎞️ Pack animation unavailable for this opening.' : '',
  ].filter(Boolean).join('\n');

  return {
    title: '🦆 Quackverse Pack Opened',
    description,
    color: 0x00d9ff,
    fields: [
      { name: 'Pack', value: packLines, inline: false },
      {
        name: 'Collection',
        value: `${input.collectionIds.length} total cards | ${uniqueCards} unique`,
        inline: true,
      },
      { name: 'Rarity Breakdown', value: rarityBreakdown(input.pack), inline: false },
    ],
    ...(input.gifUrl ? { image: { url: input.gifUrl } } : {}),
    footer: { text: 'Nebula Arcade · Quackverse' },
    timestamp: new Date().toISOString(),
  };
}

export async function POST(request: NextRequest) {
  if (!isBotRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const packId = String(body?.packId || body?.eventId || '').trim();
  const username = String(body?.username || body?.twitchUsername || 'player').trim().slice(0, 80) || 'player';
  const pack = Array.isArray(body?.pack) ? body.pack.slice(0, 12) : [];
  const channelId = String(body?.channelId || CHAT_TAG_CHANNEL_ID).trim();
  const packsRemaining = Math.max(0, Number(body?.packsRemaining || 0) || 0);
  const collectionIds = finiteIds(body?.cards || body?.collectionIds);

  if (!packId || !pack.length || !channelId) {
    return NextResponse.json({ error: 'packId, pack, and Discord channel are required' }, { status: 400 });
  }

  const baseEmbed = buildPackEmbed({ username, pack, packsRemaining, collectionIds });
  const sent = await sendDiscordMessage({
    channelId,
    content: '',
    username: CHAT_TAG_WEBHOOK_NAME,
    embeds: [baseEmbed],
    allowedMentions: { parse: [] },
    botToken: DISCORD_BOT_TOKEN,
    recordHistorySource: 'quackverse/pack-present',
  });
  if (!sent.ok) {
    return NextResponse.json({ error: sent.error }, { status: 502 });
  }

  try {
    const event = createQuackversePackMediaEvent({ eventId: packId, username, cards: pack });
    await queueQuackversePackGif(event);
    const render = await waitForQuackversePackGifResult(event.eventId);

    if (render.gifUrl) {
      const edited = await editDiscordSentMessage({
        channelId,
        result: sent,
        botToken: DISCORD_BOT_TOKEN,
        embeds: [buildPackEmbed({ username, pack, packsRemaining, collectionIds, gifUrl: render.gifUrl })],
      });
      scheduleDiscordMessageCleanup(channelId, sent, DISCORD_BOT_TOKEN, CLEANUP_DELAY_MS);
      console.log('[Quackverse Pack Present] GIF ready', {
        packId,
        channelId,
        messageId: sent.messageId,
        edited,
        attempts: render.attempts,
        gifUrl: render.gifUrl,
      });
      return NextResponse.json({ success: true, messageId: sent.messageId, gifUrl: render.gifUrl, edited });
    }

    await editDiscordSentMessage({
      channelId,
      result: sent,
      botToken: DISCORD_BOT_TOKEN,
      embeds: [buildPackEmbed({ username, pack, packsRemaining, collectionIds, animationUnavailable: true })],
    }).catch(() => false);
    scheduleDiscordMessageCleanup(channelId, sent, DISCORD_BOT_TOKEN, CLEANUP_DELAY_MS);
    console.error('[Quackverse Pack Present] GIF unavailable', {
      packId,
      channelId,
      messageId: sent.messageId,
      status: render.status,
      attempts: render.attempts,
      timedOut: render.timedOut,
      error: render.error,
    });
    return NextResponse.json({
      success: false,
      messageId: sent.messageId,
      render: {
        status: render.status,
        attempts: render.attempts,
        timedOut: render.timedOut,
        error: render.error,
      },
    }, { status: 502 });
  } catch (error) {
    scheduleDiscordMessageCleanup(channelId, sent, DISCORD_BOT_TOKEN, CLEANUP_DELAY_MS);
    console.error('[Quackverse Pack Present] Renderer request failed', {
      packId,
      channelId,
      messageId: sent.messageId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({
      success: false,
      messageId: sent.messageId,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 502 });
  }
}
