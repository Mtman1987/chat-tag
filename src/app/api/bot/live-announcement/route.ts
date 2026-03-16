import { NextRequest, NextResponse } from 'next/server';
import { updateAppState } from '@/lib/volume-store';

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  try {
    const { channel } = await req.json();
    const normalized = String(channel || '').trim().toLowerCase().replace(/^#/, '');

    if (!normalized) {
      return NextResponse.json({ error: 'channel is required' }, { status: 400 });
    }

    const today = todayUtc();

    const shouldAnnounce = await updateAppState((state) => {
      const map = state.botRuntime.firstLiveAnnouncementByChannel || {};
      const lastDate = map[normalized];

      if (lastDate === today) {
        return false;
      }

      map[normalized] = today;
      state.botRuntime.firstLiveAnnouncementByChannel = map;
      return true;
    });

    return NextResponse.json({ shouldAnnounce, date: today, channel: normalized });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}