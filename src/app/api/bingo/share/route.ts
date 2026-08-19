import { NextRequest, NextResponse } from 'next/server';
import { BINGO_CENTER_INDEX, bingoTemplatePhrases } from '@/lib/bingo-game';
import { readAppState } from '@/lib/volume-store';

export async function GET(req: NextRequest) {
  try {
    const state = await readAppState();
    const phrases = bingoTemplatePhrases(state);
    const boards = Object.values(state.bingoCards?.personalBoards || {}) as any[];
    const aggregate = {
      players: boards.length,
      totalClaims: boards.reduce((sum, board) => sum + Object.keys(board?.covered || {}).length, 0),
      completedCards: boards.filter((board) => Boolean(board?.wonAt)).length,
    };

    const format = (req.nextUrl.searchParams.get('format') || 'json').toLowerCase();
    const boardData = {
      timestamp: new Date().toISOString(),
      phrases,
      centerIndex: BINGO_CENTER_INDEX,
      centerMode: 'personal',
      aggregate,
    };

    if (format === 'txt' || format === 'text') {
      const lines: string[] = [];
      lines.push('Space Mountain Games Hub - Bingo');
      lines.push(`Generated: ${boardData.timestamp}`);
      lines.push('');
      lines.push('Shared board: 24 outer phrases + one personal center phrase per player.');
      lines.push('');
      lines.push('Phrases:');
      boardData.phrases.forEach((phrase: string, index: number) => {
        lines.push(`${index}: ${index === BINGO_CENTER_INDEX ? '[PERSONAL CENTER]' : phrase}`);
      });
      lines.push('');
      lines.push(`Players: ${aggregate.players}`);
      lines.push(`Total personal claims: ${aggregate.totalClaims}`);
      lines.push(`Completed cards: ${aggregate.completedCards}`);

      return new NextResponse(lines.join('\n'), {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': 'attachment; filename="bingo-board.txt"',
          'Cache-Control': 'no-store',
        },
      });
    }

    return NextResponse.json(boardData, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to get bingo share' }, { status: 500 });
  }
}
