import { NextRequest, NextResponse } from 'next/server';
import { updateAppState } from '@/lib/volume-store';

export async function POST(req: NextRequest) {
  const { channel } = await req.json();
  const sanitized = String(channel || '').toLowerCase().replace(/^#/, '');

  await updateAppState((state) => {
    const muted = state.botSettings.mutedChannels.channels || [];
    state.botSettings.mutedChannels.channels = muted.filter((c: string) => c !== sanitized);
    const player = Object.values(state.tagPlayers || {}).find(
      (p: any) => String(p?.twitchUsername || '').toLowerCase() === sanitized
    ) as any;
    if (player) player.overlayMode = false;
  });

  return NextResponse.json({ success: true });
}
