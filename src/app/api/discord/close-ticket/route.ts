import { NextRequest, NextResponse } from 'next/server';
import { dataDirPath, readAppState, updateAppState } from '@/lib/volume-store';
import fs from 'fs/promises';
import path from 'path';

const BOT_URL = process.env.BOT_URL || 'https://chat-tag-bot-new.fly.dev';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const messageId = searchParams.get('id');
    const resolver = searchParams.get('resolver') || 'Discord User';

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

    // Get ticket data before marking resolved
    const state = await readAppState();
    const ticket = state.supportTickets?.[messageId];

    // Mark as resolved
    await updateAppState((draft) => {
      if (draft.supportTickets?.[messageId]) {
        draft.supportTickets[messageId].resolved = true;
        draft.supportTickets[messageId].resolvedAt = new Date().toISOString();
        draft.supportTickets[messageId].resolvedBy = resolver;
      }
    });

    if (!ticket) {
      return new NextResponse(`Ticket closed successfully by ${resolver}! You can close this tab.`, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    // Generate archive content
    const content = [
      `Support Ticket #${messageId}`,
      `=`.repeat(50),
      ``,
      `User: ${ticket.requester}`,
      `Channel: twitch.tv/${ticket.channel}`,
      `Created: ${new Date(ticket.createdAt).toLocaleString()}`,
      `Resolved: ${new Date().toLocaleString()}`,
      `Resolved By: ${resolver}`,
      ``,
      `Issue:`,
      ticket.note || 'Not specified',
      ``,
      `Game State at Time of Request:`,
      `Current It: ${ticket.itPlayer}`,
      ``,
      `=`.repeat(50),
      `BOT LOGS (Last 100 lines)`,
      `=`.repeat(50),
      ``,
    ].filter(Boolean).join('\n');

    // Fetch bot logs from Fly.io API
    let logs = 'Unable to fetch logs';
    try {
      // Trigger bot to write logs
      await fetch(`${BOT_URL}/write-logs`, {
        method: 'POST'
      });

      // Read logs from volume
      const logPath = path.join(dataDirPath(), 'bot-logs.txt');
      logs = await fs.readFile(logPath, 'utf-8');
    } catch (e: any) {
      logs = `Error fetching logs: ${e.message}`;
    }

    return new NextResponse(content + logs, {
      headers: {
        'Content-Type': 'text/plain',
        'Content-Disposition': `attachment; filename="ticket-${messageId}.txt"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
