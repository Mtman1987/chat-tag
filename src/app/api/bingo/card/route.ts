import { NextResponse } from 'next/server';
import { BINGO_CENTER_INDEX, bingoTemplatePhrases } from '@/lib/bingo-game';
import { readAppState } from '@/lib/volume-store';

export async function GET() {
  try {
    const state = await readAppState();
    const phrases = bingoTemplatePhrases(state);
    const boards = Object.values(state.bingoCards?.personalBoards || {}) as any[];
    return NextResponse.json({
      card: {
        phrases,
        total: 25,
        sharedSquares: 24,
        centerIndex: BINGO_CENTER_INDEX,
        centerMode: 'personal',
        players: boards.length,
        claims: boards.reduce((sum, board) => sum + Object.keys(board?.covered || {}).length, 0),
        completedCards: boards.filter((board) => Boolean(board?.wonAt)).length,
      },
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
