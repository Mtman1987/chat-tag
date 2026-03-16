import { NextRequest, NextResponse } from 'next/server';
import { readAppState, updateAppState } from '@/lib/volume-store';

export async function POST(req: NextRequest) {
  try {
    const { messageId } = await req.json();

    if (!messageId) {
      return NextResponse.json({ error: 'messageId is required' }, { status: 400 });
    }

    const webhookUrl = process.env.DISCORD_TAG_WEBHOOK_URL || 'https://discord.com/api/webhooks/1463633328816128042/n0nTDt7yIyy_NO1i_2VeRVrf9w91dgulYShbXZ_qZzGVKUEvL_Xoebna8vNrH6SSsBbn';

    const urlParts = webhookUrl.match(/webhooks\/(\d+)\/([^\/]+)/);
    if (!urlParts) {
      return NextResponse.json({ error: 'Invalid webhook URL' }, { status: 500 });
    }

    const [, webhookId, webhookToken] = urlParts;

    // Delete Discord message
    const deleteUrl = `https://discord.com/api/webhooks/${webhookId}/${webhookToken}/messages/${messageId}`;
    const response = await fetch(deleteUrl, { method: 'DELETE' });

    if (!response.ok && response.status !== 404) {
      const text = await response.text();
      return NextResponse.json({ error: `Failed to delete message: ${text}` }, { status: 500 });
    }

    // Mark as resolved in app-state
    await updateAppState((draft) => {
      if (draft.supportTickets?.[messageId]) {
        draft.supportTickets[messageId].resolved = true;
        draft.supportTickets[messageId].resolvedAt = new Date().toISOString();
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
