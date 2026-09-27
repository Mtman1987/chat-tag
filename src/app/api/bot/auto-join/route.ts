import { NextRequest, NextResponse } from 'next/server';
import { readAppState, updateAppStateIfChanged } from '@/lib/volume-store';

export async function POST(req: NextRequest) {
  try {
    const { channels } = await req.json();
    await updateAppStateIfChanged((state) => {
      const next = Array.isArray(channels) ? channels : [];
      const changed = JSON.stringify(state.botRuntime.joinedChannels || []) !== JSON.stringify(next);
      if (changed) state.botRuntime.joinedChannels = next;
      return { changed, result: null };
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  const state = await readAppState();
  return NextResponse.json({ joined: state.botRuntime.joinedChannels || [] });
}
