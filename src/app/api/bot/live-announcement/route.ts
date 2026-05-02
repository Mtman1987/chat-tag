import { NextRequest, NextResponse } from 'next/server';
import { updateAppState } from '@/lib/volume-store';

export async function POST(req: NextRequest) {
  try {
    const { channel } = await req.json();
    const normalized = String(channel || '').trim().toLowerCase().replace(/^#/, '');

    if (!normalized) {
      return NextResponse.json({ error: 'channel is required' }, { status: 400 });
    }

    const shouldAnnounce = await updateAppState((state) => {
      const map = state.botRuntime.firstLiveAnnouncementByChannel || {};

      if (map[normalized]) {
        return false;
      }

      map[normalized] = new Date().toISOString();
      state.botRuntime.firstLiveAnnouncementByChannel = map;
      return true;
    });

    return NextResponse.json({ shouldAnnounce, channel: normalized });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
