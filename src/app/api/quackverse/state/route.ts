import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserFromRequest, isBotRequest } from '@/lib/auth';
import { isAdminUsername } from '@/lib/admin';
import {
  ensureClaimedSeat,
  quackverseUserIdFromSession,
  redactQuackverseStateForViewer,
  viewerPayload,
} from '@/lib/quackverse-access';
import { readAppState, updateAppState } from '@/lib/volume-store';
import { quackverseRoomKeyFromParams, quackverseScopeFromParams } from '@/lib/quackverse-rooms';
import { normalizeQuackverseState, type QuackverseSavedState } from '@/lib/quackverse-state';

export async function GET(req: NextRequest) {
  const sessionUser = getSessionUserFromRequest(req);
  const userId = quackverseUserIdFromSession(sessionUser);
  const roomKey = quackverseRoomKeyFromParams(req.nextUrl.searchParams);
  const scopedRoom = Boolean(quackverseScopeFromParams(req.nextUrl.searchParams));

  const saved = userId
    ? await updateAppState((appState) => {
        const current = appState.quackverseRooms?.[roomKey] || (!scopedRoom ? appState.quackverse : {});
        const state = normalizeQuackverseState(current as Partial<QuackverseSavedState>);
        const previousSeat = state.claimedPlayers.playerOne === userId || state.claimedPlayers.playerTwo === userId;
        const seat = ensureClaimedSeat(state, userId);
        if (seat && !previousSeat) state.updatedAt = new Date().toISOString();
        if (!appState.quackverseRooms) appState.quackverseRooms = {};
        appState.quackverseRooms[roomKey] = state;
        return state;
      })
    : await (async () => {
        const appState = await readAppState();
        return normalizeQuackverseState(
          (appState.quackverseRooms?.[roomKey] || (!scopedRoom ? appState.quackverse : {})) as Partial<QuackverseSavedState>,
        );
      })();


  const state = normalizeQuackverseState(saved as Partial<QuackverseSavedState>);

  const viewer = viewerPayload(sessionUser, state);
  return NextResponse.json({ state: redactQuackverseStateForViewer(state, viewer?.seat || null), viewer });
}


export async function POST(req: NextRequest) {
  const sessionUser = getSessionUserFromRequest(req);
  if (!isBotRequest(req) && !isAdminUsername(sessionUser?.twitchUsername)) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const incoming = normalizeQuackverseState(body?.state);
  const baseUpdatedAt = typeof body?.baseUpdatedAt === 'string' ? body.baseUpdatedAt : '';
  const force = body?.force === true;
  const roomKey = quackverseRoomKeyFromParams(req.nextUrl.searchParams);
  const scopedRoom = Boolean(quackverseScopeFromParams(req.nextUrl.searchParams));

  const saved = await updateAppState((state) => {
    const currentRaw = state.quackverseRooms?.[roomKey] || (!scopedRoom ? state.quackverse : {});
    const current = normalizeQuackverseState(currentRaw as Partial<QuackverseSavedState>);
    if (!force && baseUpdatedAt && current.updatedAt && baseUpdatedAt !== current.updatedAt) {
      return current;
    }

    const next: QuackverseSavedState = {
      ...incoming,
      claimedPlayers: {
        playerOne: incoming.claimedPlayers.playerOne || current.claimedPlayers.playerOne,
        playerTwo: incoming.claimedPlayers.playerTwo || current.claimedPlayers.playerTwo,
      },
      npcPlayers: incoming.npcPlayers,
      collections: current.collections,
      updatedAt: new Date().toISOString(),
    };

    if (!state.quackverseRooms) state.quackverseRooms = {};
    state.quackverseRooms[roomKey] = next;

    return next;
  });

  const normalized = normalizeQuackverseState(saved as Partial<QuackverseSavedState>);
  return NextResponse.json({ state: normalized, snapshotIgnored: false });
}
