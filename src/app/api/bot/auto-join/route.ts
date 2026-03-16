import { NextRequest, NextResponse } from 'next/server';
import { readAppState, updateAppState } from '@/lib/volume-store';

export async function POST(req: NextRequest) {
  try {
    const { channels } = await req.json();
    await updateAppState((state) => {
      state.botRuntime.joinedChannels = Array.isArray(channels) ? channels : [];
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
