import { NextRequest, NextResponse } from 'next/server';
import { readAppState, updateAppState } from '@/lib/volume-store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, tagger, tagged, doublePoints } = body;

    const finalMessage =
      message ||
      (tagger && tagged
        ? `${doublePoints ? '🔥' : '🎯'} **${tagger}** tagged **${tagged}**! ${doublePoints ? 'DOUBLE POINTS!' : ''}`.trim()
        : null);

    if (!finalMessage) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    const webhookUrl =
      process.env.DISCORD_TAG_WEBHOOK_URL ||
      'https://discord.com/api/webhooks/1463633328816128042/n0nTDt7yIyy_NO1i_2VeRVrf9w91dgulYShbXZ_qZzGVKUEvL_Xoebna8vNrH6SSsBbn';

    const state = await readAppState();
    const lastMsg = state.discordMessages.lastTagAnnouncement;

    if (lastMsg?.messageId && lastMsg?.webhookId && lastMsg?.webhookToken) {
      try {
        const deleteUrl = `https://discord.com/api/webhooks/${lastMsg.webhookId}/${lastMsg.webhookToken}/messages/${lastMsg.messageId}`;
        await fetch(deleteUrl, { method: 'DELETE' });
      } catch {}
    }

    const response = await fetch(`${webhookUrl}?wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: finalMessage }),
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
    }

    const data = await response.json();
    const urlParts = webhookUrl.match(/webhooks\/(\d+)\/([^\/]+)/);

    if (urlParts && data.id) {
      await updateAppState((draft) => {
        draft.discordMessages.lastTagAnnouncement = {
          messageId: data.id,
          webhookId: urlParts[1],
          webhookToken: urlParts[2],
          timestamp: new Date().toISOString(),
        };
      });
    }

    return NextResponse.json({ success: true, messageId: data.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}