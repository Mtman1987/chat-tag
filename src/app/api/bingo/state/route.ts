import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserFromRequest, requireAdminRequest } from '@/lib/auth';
import { makeId, readAppState, updateAppState } from '@/lib/volume-store';
import { awardGameHubPoints, joinGameHubGame } from '@/lib/game-hub-state';
import {
  BINGO_CENTER_INDEX,
  bingoTemplatePhrases,
  getPersonalBingoBoard,
  hasBingo,
  personalBingoView,
  resetPersonalBingoProgress,
  resolveBingoIdentity,
  setPersonalBingoCenter,
} from '@/lib/bingo-game';

const BINGO_SQUARE_SCORE = 1;
const BINGO_WIN_SCORE = 5;
const BINGO_SQUARE_GAME_POINTS = 1;
const BINGO_WIN_GAME_POINTS = 5;

function normalize(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/^#/, '');
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

function aggregateBingo(state: any) {
  const boards = Object.values(state.bingoCards?.personalBoards || {}) as any[];
  return {
    players: boards.length,
    totalClaims: boards.reduce((sum, board) => sum + Object.keys(board?.covered || {}).length, 0),
    completedCards: boards.filter((board) => Boolean(board?.wonAt)).length,
  };
}

export async function GET(req: NextRequest) {
  try {
    const state = await readAppState();
    const sessionUser = getSessionUserFromRequest(req);
    const identity = sessionUser ? resolveBingoIdentity(state, sessionUser) : null;
    return NextResponse.json({ bingo: { ...personalBingoView(state, identity), aggregate: aggregateBingo(state) } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
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
      if (!Number.isInteger(squareIndex) || squareIndex < 0 || squareIndex > 24) {
        return NextResponse.json({ error: 'Choose a Bingo square between 0 and 24.' }, { status: 400 });
      }
      if (!streamerChannel) {
        return NextResponse.json({ error: 'A source streamer is required for the claim.' }, { status: 400 });
      }

      const result = await updateAppState((state) => {
        const knownChannels = knownCommunityChannels(state);
        if (knownChannels.size > 0 && !knownChannels.has(streamerChannel)) {
          return { status: 400, error: 'That streamer is not in the current community roster.' };
        }

        const identity = resolveBingoIdentity(state, sessionUser);
        const board = getPersonalBingoBoard(state, identity.playerKey, true)!;
        if (squareIndex === BINGO_CENTER_INDEX && !board.centerPhrase) {
          return { status: 400, error: 'Set your personal center phrase before claiming the center square.' };
        }
        if (board.covered[String(squareIndex)]) {
          return { status: 400, error: 'You already claimed that square on this card.' };
        }
        const alreadyClaimedInStream = Object.values(board.covered).some((square: any) =>
          normalize(square?.streamerChannel) === streamerChannel
        );
        if (alreadyClaimedInStream) {
          return { status: 400, error: `You already claimed a Bingo square in ${streamerChannel}.` };
        }

        const now = new Date().toISOString();
        board.covered[String(squareIndex)] = {
          userId: identity.userId,
          username: identity.username,
          avatar: identity.avatarUrl,
          streamerChannel,
          claimedAt: now,
        };
        board.updatedAt = now;

        const completed = hasBingo(board.covered);
        const newlyWon = completed && !board.wonAt;
        if (newlyWon) board.wonAt = now;

        const joined = joinGameHubGame(state, {
          userId: identity.userId,
          username: identity.username,
          displayName: identity.displayName,
          gameId: 'bingo',
        });
        const membership = joined.membership;
        membership.lastActiveAt = now;
        membership.score += BINGO_SQUARE_SCORE;
        awardGameHubPoints(state, joined.player, BINGO_SQUARE_GAME_POINTS, 'Bingo square claimed', {
          gameId: 'bingo',
          channel: streamerChannel,
        });

        if (newlyWon) {
          membership.score += BINGO_WIN_SCORE;
          membership.wins += 1;
          awardGameHubPoints(state, joined.player, BINGO_WIN_GAME_POINTS, 'Bingo completed', {
            gameId: 'bingo',
            channel: streamerChannel,
          });
          state.bingoEvents = state.bingoEvents || [];
          state.bingoEvents.push({
            id: makeId('bingo'),
            userId: identity.userId,
            points: BINGO_WIN_SCORE,
            timestamp: Date.now(),
          });
        }

        return {
          success: true,
          bingo: newlyWon,
          alreadyWon: Boolean(board.wonAt) && !newlyWon,
          gameScore: membership.score,
          gamePointsBalance: joined.player.gamePointsBalance,
          view: personalBingoView(state, identity),
        };
      });

      if ((result as any).error) {
        return NextResponse.json({ error: (result as any).error }, { status: (result as any).status || 400 });
      }
      return NextResponse.json(result);
    }

    if (action === 'set-center' || (action === 'update-phrase' && Number(body.index) === BINGO_CENTER_INDEX)) {
      const sessionUser = getSessionUserFromRequest(req);
      if (!sessionUser) {
        return NextResponse.json({ error: 'SPMT sign-in is required to set your Bingo center phrase.' }, { status: 401 });
      }
      try {
        const result = await updateAppState((state) => {
          const identity = resolveBingoIdentity(state, sessionUser);
          setPersonalBingoCenter(state, identity, body.phrase);
          joinGameHubGame(state, {
            userId: identity.userId,
            username: identity.username,
            displayName: identity.displayName,
            gameId: 'bingo',
          });
          return personalBingoView(state, identity);
        });
        return NextResponse.json({ success: true, bingo: result });
      } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Unable to set personal center phrase.' }, { status: 400 });
      }
    }

    if (action === 'update-phrase') {
      const auth = requireAdminRequest(req);
      if (!auth.ok) return auth.response;
      const index = Number(body.index);
      const phrase = String(body.phrase || '').trim().slice(0, 120);
      if (!Number.isInteger(index) || index < 0 || index > 24 || index === BINGO_CENTER_INDEX || !phrase) {
        return NextResponse.json({ error: 'Choose one of the 24 shared outer squares and a phrase.' }, { status: 400 });
      }
      await updateAppState((state) => {
        const phrases = bingoTemplatePhrases(state);
        phrases[index] = phrase;
        state.bingoCards.current_user = {
          ...(state.bingoCards.current_user || {}),
          phrases,
          updatedAt: new Date().toISOString(),
        };
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'reset') {
      const auth = requireAdminRequest(req);
      if (!auth.ok) return auth.response;
      const incoming = Array.isArray(body.phrases)
        ? body.phrases.slice(0, 25).map((value: unknown) => String(value || '').slice(0, 120))
        : [];
      await updateAppState((state) => {
        const phrases = incoming.length === 25 ? incoming : bingoTemplatePhrases(state);
        phrases[BINGO_CENTER_INDEX] = 'SET YOUR PERSONAL PHRASE';
        state.bingoCards.current_user = {
          phrases,
          updatedAt: new Date().toISOString(),
        };
        resetPersonalBingoProgress(state);
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
