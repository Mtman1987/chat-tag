import { NextRequest, NextResponse } from 'next/server';
import { updateAppState } from '@/lib/volume-store';

export async function POST(request: NextRequest) {
  try {
    const { channel } = await request.json();
    if (!channel) {
      return NextResponse.json({ error: 'Channel required' }, { status: 400 });
    }

    const sanitized = String(channel).toLowerCase().replace(/^#/, '');

    await updateAppState((state) => {
      state.botChannels[sanitized] = {
        ...(state.botChannels[sanitized] || {}),
        name: sanitized,
        status: 'pending',
        lastUpdated: new Date().toISOString(),
      };
    });

    return NextResponse.json({ success: true, channel: sanitized });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}