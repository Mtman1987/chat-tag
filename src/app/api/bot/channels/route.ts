import { NextRequest, NextResponse } from 'next/server';
import { readAppState } from '@/lib/volume-store';

export async function GET(_req: NextRequest) {
  try {
    const state = await readAppState();
    const blacklist = new Set(
      (state.botSettings.blacklistedChannels.channels || []).map((c: string) => c.toLowerCase())
    );
    const allChannels = Object.keys(state.botChannels).filter((ch) => !blacklist.has(ch.toLowerCase()));
    const joinedChannels = new Set(
      (state.botRuntime.joinedChannels || []).map((c: string) => c.toLowerCase())
    );

    return NextResponse.json({
      channels: allChannels.map((name) => ({
        name,
        status: joinedChannels.has(name.toLowerCase()) ? 'joined' : state.botChannels[name]?.status || 'pending',
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
