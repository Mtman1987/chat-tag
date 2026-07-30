import { NextResponse } from 'next/server';
import { readAppState } from '@/lib/volume-store';
import { getWinners } from '@/lib/chat-tag-crowns';

export const dynamic = 'force-dynamic';

export async function GET() {
  const state = await readAppState();
  return NextResponse.json({ monthlyWinners: getWinners(state) });
}
