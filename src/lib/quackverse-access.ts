import { type SessionUser } from '@/lib/session';
import {
  normalizeQuackverseCollection,
  type QuackverseBattlePileState,
  type QuackversePlayerId,
  type QuackverseSavedState,
} from '@/lib/quackverse-state';

export type QuackverseViewer = {
  userId: string;
  twitchUsername: string;
  avatarUrl: string;
  seat: QuackversePlayerId | null;
};

export function quackverseUserIdFromSession(sessionUser: SessionUser | null | undefined): string {
  if (!sessionUser?.id) return '';
  return String(sessionUser.id).startsWith('user_') ? String(sessionUser.id) : `user_${sessionUser.id}`;
}

export function normalizeQuackverseUserId(userId: unknown): string {
  const value = String(userId || '').trim();
  if (!value) return '';
  return value.startsWith('user_') || value.startsWith('manual_') ? value : `user_${value}`;
}

export function getClaimedSeat(state: QuackverseSavedState, userId: string): QuackversePlayerId | null {
  if (!userId) return null;
  if (state.claimedPlayers.playerOne === userId) return 'playerOne';
  if (state.claimedPlayers.playerTwo === userId) return 'playerTwo';
  return null;
}

export function ensureClaimedSeat(state: QuackverseSavedState, userId: string): QuackversePlayerId | null {
  const existing = getClaimedSeat(state, userId);
  if (existing) return existing;
  if (!state.claimedPlayers.playerOne) {
    state.claimedPlayers.playerOne = userId;
    return 'playerOne';
  }
  if (!state.claimedPlayers.playerTwo) {
    state.claimedPlayers.playerTwo = userId;
    return 'playerTwo';
  }
  return null;
}

function hiddenPile(pile: QuackverseBattlePileState, owner: QuackversePlayerId): QuackverseBattlePileState {
  return {
    drawPile: pile.drawPile.map((_, index) => ({ instanceId: `${owner}-draw-hidden-${index}`, cardId: 0 })),
    hand: pile.hand.map((_, index) => ({ instanceId: `${owner}-hand-hidden-${index}`, cardId: 0 })),
    discardPile: pile.discardPile,
  };
}

export function redactQuackverseStateForViewer(state: QuackverseSavedState, viewerSeat: QuackversePlayerId | null): QuackverseSavedState {
  if (!viewerSeat) {
    return {
      ...state,
      battlePiles: {
        playerOne: hiddenPile(state.battlePiles.playerOne, 'playerOne'),
        playerTwo: hiddenPile(state.battlePiles.playerTwo, 'playerTwo'),
      },
      collections: {},
    };
  }

  const opponent: QuackversePlayerId = viewerSeat === 'playerOne' ? 'playerTwo' : 'playerOne';
  return {
    ...state,
    battlePiles: {
      ...state.battlePiles,
      [opponent]: hiddenPile(state.battlePiles[opponent], opponent),
    },
    collections: {},
  };
}

export function viewerPayload(sessionUser: SessionUser | null | undefined, state: QuackverseSavedState): QuackverseViewer | null {
  const userId = quackverseUserIdFromSession(sessionUser);
  if (!userId || !sessionUser) return null;
  return {
    userId,
    twitchUsername: sessionUser.twitchUsername,
    avatarUrl: sessionUser.avatarUrl,
    seat: getClaimedSeat(state, userId),
  };
}

export function getCollectionForUser(state: QuackverseSavedState, userId: string) {
  state.collections = state.collections || {};
  const collection = normalizeQuackverseCollection(state.collections[userId]);
  state.collections[userId] = collection;
  return collection;
}
