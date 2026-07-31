import { NextRequest, NextResponse } from 'next/server';
import { readAppState, updateAppState } from '@/lib/volume-store';
import { buildGameStatePayload, postOrUpdateChatTagEmbed } from '@/lib/chat-tag-discord';

type AnnouncementRecord = {
  id: string;
  title: string;
  description: string;
  details: string[];
  kind: string;
  timestamp: string;
};

function cleanText(value: unknown, maxLength = 1024) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function buildCustomAnnouncement(body: Record<string, any>): AnnouncementRecord | null {
  const embeds = Array.isArray(body.embeds)
    ? body.embeds
    : body.title || body.description || Array.isArray(body.fields)
      ? [{
          title: body.title,
          description: body.description,
          fields: body.fields,
        }]
      : [];
  const primary = embeds[0];
  if (!primary) return null;

  const details = [
    ...(Array.isArray(primary.fields)
      ? primary.fields.slice(0, 4).map((field: any) => {
          const name = cleanText(field?.name, 120);
          const value = cleanText(field?.value, 500);
          return name && value ? `**${name}:** ${value}` : '';
        })
      : []),
    ...embeds.slice(1, 4).map((embed: any) => {
      const title = cleanText(embed?.title, 120);
      const description = cleanText(embed?.description, 300);
      return [title && `**${title}**`, description].filter(Boolean).join(' — ');
    }),
  ].filter(Boolean);

  return {
    id: `announcement_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: cleanText(primary.title || body.title || 'Chat Tag Update', 200),
    description: cleanText(primary.description || body.description || 'A new Chat Tag update was posted.', 700),
    details,
    kind: cleanText(body.kind || 'custom', 40),
    timestamp: new Date().toISOString(),
  };
}

function buildTagAnnouncement(body: Record<string, any>, gameState: any): AnnouncementRecord | null {
  const tagger = cleanText(body.tagger, 100);
  const tagged = cleanText(body.tagged, 100);
  if (!tagger || !tagged) return null;

  const doublePoints = Boolean(body.doublePoints);
  const reason = cleanText(body.message, 180);
  const passUsed = /pass/i.test(reason);
  const isRotation = tagger.toLowerCase() === 'system' || /rotation/i.test(reason);
  const nowIt = cleanText(gameState.tag?.currentIt?.twitchUsername || 'Free for all', 100);
  const title = passUsed
    ? '🎟️ Pass Tag — Double Points'
    : isRotation
      ? '🎲 Automatic Rotation'
      : doublePoints
        ? '🔥 Double-Points Tag'
        : '🎯 New Tag';
  const description = passUsed
    ? `**${tagger}** used a Pass to tag **${tagged}** for **DOUBLE POINTS**.`
    : isRotation
      ? `The system selected **${tagged}** as the new tagged player${reason ? ` — ${reason}` : ''}.`
      : `**${tagger}** tagged **${tagged}**${doublePoints ? ' for **DOUBLE POINTS**' : ''}.`;

  return {
    id: `announcement_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    description,
    details: [
      `**Now IT:** ${nowIt}`,
      `**Players:** ${Number(gameState.tag?.playerCount || 0)}`,
      ...(reason && !isRotation ? [`**Details:** ${reason}`] : []),
    ],
    kind: passUsed ? 'pass' : isRotation ? 'rotation' : doublePoints ? 'double-points-tag' : 'tag',
    timestamp: new Date().toISOString(),
  };
}

async function storeAnnouncement(announcement: AnnouncementRecord) {
  await updateAppState((state) => {
    const existing = Array.isArray(state.discordMessages?.announcements)
      ? state.discordMessages.announcements
      : [];
    state.discordMessages.announcements = [announcement, ...existing]
      .filter((entry, index, list) =>
        entry?.id && list.findIndex((candidate) => candidate?.id === entry.id) === index
      )
      .slice(0, 10);
    state.discordMessages.lastTagAnnouncement = announcement;
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const state = await readAppState();
    const gameState = buildGameStatePayload(state);
    const refreshOnly = Boolean(body.refreshOnly);
    const announcement = refreshOnly
      ? null
      : buildCustomAnnouncement(body) || buildTagAnnouncement(body, gameState);

    if (!refreshOnly && !announcement) {
      return NextResponse.json(
        { success: false, error: 'An announcement payload or tagger/tagged pair is required' },
        { status: 400 },
      );
    }

    if (announcement) {
      await storeAnnouncement(announcement);
    }

    try {
      const embed = await postOrUpdateChatTagEmbed();
      return NextResponse.json({
        success: true,
        announcement: announcement
          ? { integrated: true, id: announcement.id, kind: announcement.kind }
          : { integrated: false, refreshOnly: true },
        discord: {
          ok: true,
          integrated: true,
          separateMessagePosted: false,
        },
        embed,
      });
    } catch (error: any) {
      console.error('[Announce] Chat Tag permanent embed refresh failed:', error.message);
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          announcement: announcement ? { integrated: true, id: announcement.id } : null,
          discord: {
            ok: false,
            integrated: true,
            separateMessagePosted: false,
          },
          embed: { ok: false, error: error.message },
        },
        { status: 502 },
      );
    }
  } catch (error: any) {
    console.error('[Announce] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
