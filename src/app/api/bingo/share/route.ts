import { NextRequest, NextResponse } from 'next/server';
import { readAppState } from '@/lib/volume-store';

export async function GET(req: NextRequest) {
  try {
    const state = await readAppState();
    const card = state?.bingoCards?.current_user || { phrases: [], covered: {} };

    const format = (req.nextUrl.searchParams.get('format') || 'json').toLowerCase();

    const boardData = {
      timestamp: new Date().toISOString(),
      phrases: card.phrases || [],
      covered: card.covered || {},
      summary: {
        claimedCount: Object.keys(card.covered || {}).length,
        freeSpace: card.phrases?.[12] || 'FREE SPACE'
      }
    };

    if (format === 'txt' || format === 'text') {
      const lines: string[] = [];
      lines.push('Chat Tag Bingo Share');
      lines.push(`Generated: ${boardData.timestamp}`);
      lines.push('');
      lines.push('Board state:');

      for (let row = 0; row < 5; row++) {
        const rowSquares: string[] = [];

        for (let col = 0; col < 5; col++) {
          const idx = row * 5 + col;
          const claimed = Boolean((boardData.covered || {})[idx]);
          const marker = claimed ? '🟩' : '⬜';
          rowSquares.push(`${marker}${idx.toString().padStart(2, '0')}`);
        }

        lines.push(rowSquares.join(' '));
      }

      lines.push('');
      lines.push('Phrases:');
      boardData.phrases.forEach((phrase: string, index: number) => {
        lines.push(`${index}: ${phrase}`);
      });

      lines.push('');
      lines.push(`Claimed squares: ${boardData.summary.claimedCount}`);

      return new NextResponse(lines.join('\n'), {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': 'attachment; filename="bingo-board.txt"'
        },
      });
    }

    return NextResponse.json(boardData);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to get bingo share' }, { status: 500 });
  }
}
