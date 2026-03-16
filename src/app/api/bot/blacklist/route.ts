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
  });

  return NextResponse.json({ success: true, channel: normalized });
}