import { NextRequest, NextResponse } from 'next/server';
import { updateAppState } from '@/lib/volume-store';

export async function POST(request: NextRequest) {
  try {
    const { channel } = await request.json();
    if (!channel) {
      return NextResponse.json({ error: 'Channel required' }, { status: 400 });
    }

    const sanitized = String(channel).toLowerCase().replace(/^#/, '');

    const result = await updateAppState((state) => {
      const blacklist = new Set(
        (state.botSettings.blacklistedChannels.channels || []).map((c: string) => c.toLowerCase())
      );
      if (blacklist.has(sanitized)) {
        return { blocked: true };
      }

      state.botChannels[sanitized] = {
        ...(state.botChannels[sanitized] || {}),
        name: sanitized,
        status: 'joined',
        lastUpdated: new Date().toISOString(),
      };
      return { blocked: false };
    });

    if (result.blocked) {
      return NextResponse.json(
        { error: 'Channel is blacklisted/opted out and cannot be joined.' },
        { status: 403 }
      );
    }

    try {
      await fetch('http://chat-tag-bot.internal:8091/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: sanitized }),
      });
    } catch {}

    return NextResponse.json({ success: true, channel: sanitized });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
