import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserFromRequest, requireAdminRequest } from '@/lib/auth';
import { makeId, readAppState, updateAppState } from '@/lib/volume-store';
import { awardGameHubPoints, joinGameHubGame } from '@/lib/game-hub-state';

const BINGO_SQUARE_SCORE = 1;
const BINGO_WIN_SCORE = 5;
const BINGO_SQUARE_GAME_POINTS = 1;
const BINGO_WIN_GAME_POINTS = 5;
const FREE_SPACE_INDEX = 12;

function normalize(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/^#/, '');
}

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
  const userSquares = new Set(
    Object.keys(covered)
      .filter((key) => normalize(covered[key]?.username) === normalize(username))
      .map((key) => parseInt(key, 10))
  );
  userSquares.add(FREE_SPACE_INDEX);

  for (let row = 0; row < 5; row += 1) {
    const rowSquares = [row * 5, row * 5 + 1, row * 5 + 2, row * 5 + 3, row * 5 + 4];
    if (rowSquares.every((square) => userSquares.has(square))) return true;
  }

  for (let col = 0; col < 5; col += 1) {
    const colSquares = [col, col + 5, col + 10, col + 15, col + 20];
    if (colSquares.every((square) => userSquares.has(square))) return true;
  }

  const diag1 = [0, 6, 12, 18, 24];
  const diag2 = [4, 8, 12, 16, 20];
  if (diag1.every((square) => userSquares.has(square))) return true;
  if (diag2.every((square) => userSquares.has(square))) return true;

  return false;
}

function knownCommunityChannels(state: any) {
  const channels = new Set<string>();
  for (const user of Object.values(state.users || {}) as any[]) {
    const channel = normalize(user?.twitchUsername || user?.username);
    if (channel) channels.add(channel);
  }
  for (const channel of Object.keys(state.botChannels || {})) {
    const normalized = normalize(channel);
    if (normalized) channels.add(normalized);
  }
  return channels;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '').trim().toLowerCase();

    if (action === 'claim') {
      const sessionUser = getSessionUserFromRequest(req);
      if (!sessionUser) {
        return NextResponse.json({ error: 'SPMT sign-in is required to claim Bingo squares.' }, { status: 401 });
      }

      const squareIndex = Number(body.squareIndex);
      const streamerChannel = normalize(body.streamerChannel);
      if (!Number.isInteger(squareIndex) || squareIndex < 0 || squareIndex > 24 || squareIndex === FREE_SPACE_INDEX) {
        return NextResponse.json({ error: 'Choose a claimable Bingo square between 0 and 24.' }, { status: 400 });
      }
      if (!streamerChannel) {
        return NextResponse.json({ error: 'A source streamer is required for the claim.' }, { status: 400 });
      }

      const result = await updateAppState((state) => {
        const knownChannels = knownCommunityChannels(state);
        if (knownChannels.size > 0 && !knownChannels.has(streamerChannel)) {
          return { status: 400, error: 'That streamer is not in the current community roster.' };
        }

        const card = state.bingoCards.current_user || { phrases: [], covered: {} };
        if (card.covered?.[squareIndex]) {
          return { status: 400, error: 'Square already claimed' };
        }

        const playerName = normalize(sessionUser.twitchUsername);
        const alreadyClaimedInStream = Object.values(card.covered || {}).some((square: any) =>
          normalize(square?.username) === playerName && normalize(square?.streamerChannel) === streamerChannel
        );
        if (alreadyClaimedInStream) {
          return { status: 400, error: `You already claimed a Bingo square in ${streamerChannel}.` };
        }

        const covered = { ...(card.covered || {}) };
        covered[squareIndex] = {
          userId: sessionUser.id,
          username: sessionUser.twitchUsername,
          avatar: sessionUser.avatarUrl || '',
          streamerChannel,
        };
        const now = new Date().toISOString();
        state.bingoCards.current_user = { ...card, covered, updatedAt: now };

        const hasBingo = checkBingo(covered, sessionUser.twitchUsername);
        const joined = joinGameHubGame(state, {
          userId: sessionUser.id,
          username: sessionUser.twitchUsername,
          displayName: sessionUser.twitchUsername,
          gameId: 'bingo',
        });
        const membership = joined.membership;
        membership.lastActiveAt = now;
        membership.score += BINGO_SQUARE_SCORE;
        awardGameHubPoints(state, joined.player, BINGO_SQUARE_GAME_POINTS, 'Bingo square claimed', {
          gameId: 'bingo',
          channel: streamerChannel,
        });

        if (hasBingo) {
          membership.score += BINGO_WIN_SCORE;
          membership.wins += 1;
          awardGameHubPoints(state, joined.player, BINGO_WIN_GAME_POINTS, 'Bingo completed', {
            gameId: 'bingo',
            channel: streamerChannel,
          });
          state.bingoEvents = state.bingoEvents || [];
          state.bingoEvents.push({
            id: makeId('bingo'),
            userId: sessionUser.id,
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

    if (action === 'update-phrase') {
      const auth = requireAdminRequest(req);
      if (!auth.ok) return auth.response;
      const index = Number(body.index);
      const phrase = String(body.phrase || '').trim().slice(0, 120);
      if (!Number.isInteger(index) || index < 0 || index > 24 || !phrase) {
        return NextResponse.json({ error: 'A valid square and phrase are required.' }, { status: 400 });
      }
      await updateAppState((state) => {
        const card = state.bingoCards.current_user || { phrases: [], covered: {} };
        const phrases = Array.isArray(card.phrases) ? [...card.phrases] : [];
        while (phrases.length < 25) phrases.push('');
        phrases[index] = index === FREE_SPACE_INDEX ? 'FREE SPACE' : phrase;
        state.bingoCards.current_user = { ...card, phrases, updatedAt: new Date().toISOString() };
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'reset') {
      const auth = requireAdminRequest(req);
      if (!auth.ok) return auth.response;
      const phrases = Array.isArray(body.phrases) ? body.phrases.slice(0, 25).map((value: unknown) => String(value || '').slice(0, 120)) : [];
      if (phrases.length === 25) phrases[FREE_SPACE_INDEX] = 'FREE SPACE';
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
