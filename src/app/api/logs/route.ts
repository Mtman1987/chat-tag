import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/auth';
import { readAppState } from '@/lib/volume-store';

const BOT_URL = process.env.BOT_URL || 'https://chat-tag-bot-new.fly.dev';

export async function GET(req: NextRequest) {
  const auth = requireAdminRequest(req);
  if (!auth.ok) return auth.response;
  try {
    // Fetch recent mod log + admin history from volume store
    const state = await readAppState();
    const modLog = ((state as any).modLog || [])
      .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 50);
    const adminHistory = (state.adminHistory || [])
      .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 50);

    // Format as readable text
    const lines: string[] = [];
    lines.push('=== ADMIN HISTORY (last 50) ===');
    for (const entry of adminHistory) {
      const time = entry.timestamp ? new Date(entry.timestamp).toISOString() : 'unknown';
      lines.push(`[${time}] ${entry.performedBy || entry.actor || 'system'} ${entry.action} ${entry.targetUser || entry.details || ''}`);
    }
    lines.push('');
    lines.push('=== MOD LOG (last 50) ===');
    for (const entry of modLog) {
      const time = entry.timestamp ? new Date(entry.timestamp).toISOString() : 'unknown';
      lines.push(`[${time}] ${entry.actor || 'system'} ${entry.action} ${entry.target || ''} ${entry.detail || ''} ${entry.channel ? `in ${entry.channel}` : ''}`);
    }

    // Also try to get bot runtime logs
    let botLogs = '';
    try {
      const botRes = await fetch(`${BOT_URL}/health`, { signal: AbortSignal.timeout(5000) });
      if (botRes.ok) {
        const botData = await botRes.json();
        lines.push('');
        lines.push('=== BOT STATUS ===');
        lines.push(`Connected: ${botData.connected}`);
        lines.push(`Joined Channels: ${botData.joinedChannels}`);
        lines.push(`Uptime: ${botData.uptimeSec}s`);
        lines.push(`Bot User: ${botData.botUser}`);
      }
    } catch {}

    const content = lines.join('\n');

    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/plain',
        'Content-Disposition': `attachment; filename="chat-tag-logs-${Date.now()}.txt"`,
      },
    });
  } catch (error: any) {
    return new NextResponse(`Error fetching logs: ${error.message}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
