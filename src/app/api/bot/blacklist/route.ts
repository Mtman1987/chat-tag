import { NextRequest, NextResponse } from 'next/server';
import { readAppState, updateAppState } from '@/lib/volume-store';

function normalize(channel: string): string {
  return String(channel || '').toLowerCase().trim().replace(/^#/, '');
}

export async function GET() {
  const state = await readAppState();
  return NextResponse.json({ blacklisted: state.botSettings.blacklistedChannels.channels || [] });
}

export async function POST(req: NextRequest) {
  const { channel } = await req.json();
  const normalized = normalize(channel);
  if (!normalized) {
    return NextResponse.json({ error: 'channel is required' }, { status: 400 });
  }

  await updateAppState((state) => {
    const list = state.botSettings.blacklistedChannels.channels || [];
    if (!list.includes(normalized)) list.push(normalized);
    state.botSettings.blacklistedChannels.channels = list;
    delete state.botChannels[normalized];

    let removedCurrentIt = false;
    for (const player of Object.values(state.tagPlayers || {}) as any[]) {
      const username = normalize(player?.twitchUsername || player?.username || '');
      if (username !== normalized) continue;
      player.optedOut = true;
      player.isActive = false;
      player.isPlayer = false;
      player.offlineImmunity = true;
      player.sleepingImmunity = false;
      if (player.isIt) {
        player.isIt = false;
        removedCurrentIt = true;
      }
    }

    for (const user of Object.values(state.users || {}) as any[]) {
      const username = normalize(user?.twitchUsername || user?.username || '');
      if (username !== normalized) continue;
      user.optedOut = true;
      user.isActive = false;
    }

    if (removedCurrentIt && state.tagGame?.state) {
      state.tagGame.state.currentIt = null;
      state.tagGame.state.lastTagTime = Date.now();
    }
  });

  return NextResponse.json({ success: true, channel: normalized });
}

export async function DELETE(req: NextRequest) {
  const { channel } = await req.json();
  const normalized = normalize(channel);
  if (!normalized) {
    return NextResponse.json({ error: 'channel is required' }, { status: 400 });
  }

  await updateAppState((state) => {
    const list = state.botSettings.blacklistedChannels.channels || [];
    state.botSettings.blacklistedChannels.channels = list.filter((c: string) => c !== normalized);

    for (const player of Object.values(state.tagPlayers || {}) as any[]) {
      const username = normalize(player?.twitchUsername || player?.username || '');
      if (username !== normalized) continue;
      player.optedOut = false;
      player.isPlayer = true;
    }

    for (const user of Object.values(state.users || {}) as any[]) {
      const username = normalize(user?.twitchUsername || user?.username || '');
      if (username !== normalized) continue;
      user.optedOut = false;
    }
  });

  return NextResponse.json({ success: true, channel: normalized });
}
