import { NextRequest, NextResponse } from 'next/server';
import { makeId, readAppState, updateAppState } from '@/lib/volume-store';

export async function GET() {
  try {
    const state = await readAppState();
    const card = state.bingoCards.current_user;

    if (!card) {
      return NextResponse.json({ bingo: { phrases: [], covered: {} } });
    }

    return NextResponse.json({ bingo: card });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function checkBingo(covered: Record<string, any>, username: string): boolean {
  const userSquares = Object.keys(covered)
    .filter((key) => covered[key]?.username === username)
    .map((key) => parseInt(key, 10));

  for (let row = 0; row < 5; row += 1) {
    const rowSquares = [row * 5, row * 5 + 1, row * 5 + 2, row * 5 + 3, row * 5 + 4];
    if (rowSquares.every((s) => userSquares.includes(s))) return true;
  }

  for (let col = 0; col < 5; col += 1) {
    const colSquares = [col, col + 5, col + 10, col + 15, col + 20];
    if (colSquares.every((s) => userSquares.includes(s))) return true;
  }

  const diag1 = [0, 6, 12, 18, 24];
  const diag2 = [4, 8, 12, 16, 20];
  if (diag1.every((s) => userSquares.includes(s))) return true;
  if (diag2.every((s) => userSquares.includes(s))) return true;

  return false;
}

export async function POST(req: NextRequest) {
  try {
    const { action, squareIndex, userId, username, avatar, streamerChannel, phrases } = await req.json();

    if (action === 'claim') {
      // CRITICAL FIX: Validate squareIndex before processing
      if (!Number.isInteger(squareIndex) || squareIndex < 0 || squareIndex > 24) {
        return NextResponse.json(
          { error: `Invalid square index: ${squareIndex}. Must be between 0 and 24.` },
          { status: 400 }
        );
      }

      // Validate other required fields
      if (!userId && !username) {
        return NextResponse.json({ error: 'userId or username is required' }, { status: 400 });
      }

      const result = await updateAppState((state) => {
        const card = state.bingoCards.current_user || { phrases: [], covered: {} };

        if (card.covered?.[squareIndex]) {
          return { status: 400, error: 'Square already claimed' };
        }

        const covered = { ...(card.covered || {}) };
        covered[squareIndex] = { userId: userId || username, username: username || userId, avatar, streamerChannel };
        state.bingoCards.current_user = { ...card, covered, updatedAt: new Date().toISOString() };

        const hasBingo = checkBingo(covered, username || userId);
        if (hasBingo) {
          const player = state.tagPlayers?.[username || userId];
          if (player) {
            player.score = (player.score || 0) + 100;
            player.bingoWins = (player.bingoWins || 0) + 1;
          }
          state.bingoEvents = state.bingoEvents || [];
          state.bingoEvents.push({
            id: makeId('bingo'),
            userId: userId || username,
            points: 100,
            timestamp: Date.now(),
          });
        }

        return { success: true, bingo: hasBingo };
      });

      if ((result as any).error) {
        return NextResponse.json({ error: (result as any).error }, { status: (result as any).status || 400 });
      }

      return NextResponse.json(result);
    }

    if (action === 'reset') {
      await updateAppState((state) => {
        state.bingoCards.current_user = {
          phrases,
          covered: {},
          updatedAt: new Date().toISOString(),
        };
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}