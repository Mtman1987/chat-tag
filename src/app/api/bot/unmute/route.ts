import { NextRequest, NextResponse } from 'next/server';
import { updateAppState } from '@/lib/volume-store';

export async function POST(req: NextRequest) {
  const { channel } = await req.json();
  const sanitized = String(channel || '').toLowerCase().replace(/^#/, '');

  await updateAppState((state) => {
    const muted = state.botSettings.mutedChannels.channels || [];
    state.botSettings.mutedChannels.channels = muted.filter((c: string) => c !== sanitized);
  });

  return NextResponse.json({ success: true });
}