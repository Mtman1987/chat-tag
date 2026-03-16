import { NextRequest, NextResponse } from 'next/server';
import { readAppState } from '@/lib/volume-store';

export async function GET(_req: NextRequest) {
  try {
    const state = await readAppState();
    const channels = Object.values(state.botChannels)
      .filter((c: any) => c.status === 'pending')
      .map((c: any) => c.name);

    return NextResponse.json({ channels });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}