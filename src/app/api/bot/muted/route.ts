import { NextRequest, NextResponse } from 'next/server';
import { readAppState, updateAppState } from '@/lib/volume-store';

export async function GET() {
  const state = await readAppState();
  return NextResponse.json({ muted: state.botSettings.mutedChannels.channels || [] });
}

export async function POST(req: NextRequest) {
  const { channel } = await req.json();
  const sanitized = String(channel || '').toLowerCase().replace(/^#/, '');

  await updateAppState((state) => {
    const muted = state.botSettings.mutedChannels.channels || [];
    if (!muted.includes(sanitized)) muted.push(sanitized);
    state.botSettings.mutedChannels.channels = muted;
  });

  return NextResponse.json({ success: true });
}