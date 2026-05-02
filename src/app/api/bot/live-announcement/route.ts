import { NextRequest, NextResponse } from 'next/server';
import { updateAppState } from '@/lib/volume-store';

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  try {
    const { channel, streamStartedAt } = await req.json();
    const normalized = String(channel || '').trim().toLowerCase().replace(/^#/, '');

    if (!normalized) {
      return NextResponse.json({ error: 'channel is required' }, { status: 400 });
    }

    const streamKey = String(streamStartedAt || '').trim() || todayUtc();

    const shouldAnnounce = await updateAppState((state) => {
      const map = state.botRuntime.firstLiveAnnouncementByChannel || {};
      const previousKey = map[normalized];

      if (previousKey === streamKey) {
        return false;
      }

      // Legacy entries used YYYY-MM-DD. Treat a same-day legacy entry as already
      // announced, then upgrade it to this stream session key.
      if (
        typeof previousKey === 'string' &&
        previousKey.length === 10 &&
        streamKey.startsWith(previousKey)
      ) {
        map[normalized] = streamKey;
        state.botRuntime.firstLiveAnnouncementByChannel = map;
        return false;
      }

      map[normalized] = streamKey;
      state.botRuntime.firstLiveAnnouncementByChannel = map;
      return true;
    });

    return NextResponse.json({ shouldAnnounce, channel: normalized, streamKey });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
