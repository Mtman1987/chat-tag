import { NextResponse } from 'next/server';
import { readAppState } from '@/lib/volume-store';

export async function GET() {
  try {
    const state = await readAppState();
    const card = state.bingoCards.current_user;

    if (!card) {
      return NextResponse.json({ card: null });
    }

    const coveredCount = Object.keys(card.covered || {}).length;
    const totalSquares = card.phrases?.length || 25;

    return NextResponse.json({
      card: {
        phrases: card.phrases,
        covered: coveredCount,
        total: totalSquares,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}