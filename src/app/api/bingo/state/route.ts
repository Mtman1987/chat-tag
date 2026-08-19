import { NextRequest, NextResponse } from 'next/server';
import { makeId, readAppState, updateAppState } from '@/lib/volume-store';
import { awardGameHubPoints, joinGameHubGame } from '@/lib/game-hub-state';

const BINGO_SQUARE_SCORE = 1;
const BINGO_WIN_SCORE = 5;
const BINGO_SQUARE_GAME_POINTS = 1;
const BINGO_WIN_GAME_POINTS = 5;

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

function linkedTwitchId(state: any, username: string, suppliedUserId: unknown): string | undefined {
  const supplied = String(suppliedUserId || '').replace(/^user_/, '').trim();
  if (/^\d+$/.test(supplied)) return supplied;
  const login = String(username || '').trim().toLowerCase();
  if (!login) return undefined;
  const match = Object.values(state.users || {}).find((candidate: any) =>
    String(candidate?.twitchUsername || '').trim().toLowerCase() === login
  ) as any;
  const id = String(match?.id || '').trim();
  return /^\d+$/.test(id) ? id : undefined;
}

export async function POST(req: NextRequest) {
  try {
    const { action, squareIndex, userId, username, avatar, streamerChannel, phrases } = await req.json();

    if (action === 'claim') {
      if (!Number.isInteger(squareIndex) || squareIndex < 0 || squareIndex > 24) {
        return NextResponse.json(
          { error: `Invalid square index: ${squareIndex}. Must be between 0 and 24.` },
          { status: 400 }
        );
      }

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
        const now = new Date().toISOString();
        state.bingoCards.current_user = { ...card, covered, updatedAt: now };

        const playerName = String(username || userId || '').trim();
        const hasBingo = checkBingo(covered, playerName);
        const gameUserId = linkedTwitchId(state, playerName, userId);
        const joined = joinGameHubGame(state, {
          userId: gameUserId,
          username: playerName,
          displayName: playerName,
          gameId: 'bingo',
        });
        const membership = joined.membership;
        membership.lastActiveAt = now;
        membership.score += BINGO_SQUARE_SCORE;
        awardGameHubPoints(state, joined.player, BINGO_SQUARE_GAME_POINTS, 'Bingo square claimed', {
          gameId: 'bingo',
          channel: String(streamerChannel || '').trim().toLowerCase(),
        });

        if (hasBingo) {
          membership.score += BINGO_WIN_SCORE;
          membership.wins += 1;
          membership.plays += 1;
          awardGameHubPoints(state, joined.player, BINGO_WIN_GAME_POINTS, 'Bingo completed', {
            gameId: 'bingo',
            channel: String(streamerChannel || '').trim().toLowerCase(),
          });
          state.bingoEvents = state.bingoEvents || [];
          state.bingoEvents.push({
            id: makeId('bingo'),
            userId: gameUserId || userId || username,
            points: BINGO_WIN_SCORE,
            timestamp: Date.now(),
          });
        }

        return {
          success: true,
          bingo: hasBingo,
          gameScore: membership.score,
          gamePointsBalance: joined.player.gamePointsBalance,
        };
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
