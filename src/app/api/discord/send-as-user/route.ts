import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/auth';
import { sendDiscordMessage } from '@/lib/discord-webhooks';

export async function POST(req: NextRequest) {
  const auth = requireAdminRequest(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const {
      channelId,
      content,
      username,
      avatarUrl,
      embeds,
      components,
      webhookName,
      fallbackToBot,
    } = body || {};

    if (!String(channelId || '').trim()) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }
    if (!/^\d+$/.test(String(channelId).trim())) {
      return NextResponse.json({ error: 'channelId must be a Discord channel id' }, { status: 400 });
    }

    if (!String(content || '').trim() && (!embeds || (Array.isArray(embeds) && embeds.length === 0))) {
      return NextResponse.json({ error: 'content or embeds are required' }, { status: 400 });
    }

    const result = await sendDiscordMessage({
      channelId,
      content,
      username,
      avatarUrl,
      embeds,
      components,
      webhookName,
      fallbackToBot,
      recordHistorySource: 'discord/send-as-user',
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      via: result.via,
      messageId: result.messageId || null,
      webhook: result.webhook || null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
