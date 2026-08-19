import type { AppState, JsonObject } from '@/lib/volume-store';
import type { SessionUser } from '@/lib/session';
import { commonBingoPhrases } from '@/lib/bingo-data';
import { normalizeGameHubPlayerId } from '@/lib/game-hub-state';
import { findLegacyTwitchUserRecord } from '@/lib/quackverse-identity';

export const BINGO_CENTER_INDEX = 12;
export const BINGO_CENTER_PLACEHOLDER = 'SET YOUR PERSONAL PHRASE';

export type BingoIdentity = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  playerKey: string;
};

export type PersonalBingoBoard = {
  centerPhrase: string;
  covered: Record<string, JsonObject>;
  wonAt?: string;
  updatedAt?: string;
};

function normalizeLogin(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/^#/, '');
}

export function resolveBingoIdentity(state: AppState, user: SessionUser): BingoIdentity {
  const suppliedId = String(user.id || '').replace(/^user_/, '').trim();
  const suppliedName = normalizeLogin(user.twitchUsername);
  const direct = /^\d+$/.test(suppliedId) ? state.users?.[suppliedId] : null;
  const linked = direct
    ? {
        id: String(direct.id || suppliedId),
        twitchUsername: String(direct.twitchUsername || suppliedName),
        avatarUrl: String(direct.avatarUrl || user.avatarUrl || ''),
      }
    : findLegacyTwitchUserRecord(state.users, suppliedName);
  const userId = String(linked?.id || suppliedId || suppliedName);
  const username = normalizeLogin(linked?.twitchUsername || suppliedName);
  return {
    userId,
    username,
    displayName: String(linked?.twitchUsername || user.twitchUsername || username),
    avatarUrl: String(linked?.avatarUrl || user.avatarUrl || ''),
    playerKey: normalizeGameHubPlayerId(userId, username),
  };
}

export function bingoTemplatePhrases(state: AppState): string[] {
  const existing = Array.isArray(state.bingoCards?.current_user?.phrases)
    ? state.bingoCards.current_user.phrases.map((value: unknown) => String(value || '').slice(0, 120))
    : [];
  const phrases = existing.length >= 25 ? existing.slice(0, 25) : commonBingoPhrases.slice(0, 24);
  if (phrases.length === 24) phrases.splice(BINGO_CENTER_INDEX, 0, BINGO_CENTER_PLACEHOLDER);
  while (phrases.length < 25) phrases.push('');
  phrases[BINGO_CENTER_INDEX] = BINGO_CENTER_PLACEHOLDER;
  return phrases;
}

export function getPersonalBingoBoard(state: AppState, playerKey: string, create = true): PersonalBingoBoard | null {
  state.bingoCards ||= {};
  const boards = (state.bingoCards.personalBoards ||= {}) as Record<string, PersonalBingoBoard>;
  let board = boards[playerKey];
  if (!board && create) {
    board = { centerPhrase: '', covered: {}, updatedAt: new Date().toISOString() };
    boards[playerKey] = board;
  }
  if (!board) return null;
  board.centerPhrase = String(board.centerPhrase || '').trim().slice(0, 120);
  board.covered = board.covered && typeof board.covered === 'object' ? board.covered : {};
  if (board.wonAt) board.wonAt = String(board.wonAt);
  return board;
}

export function personalBingoView(state: AppState, identity: BingoIdentity | null) {
  const phrases = bingoTemplatePhrases(state);
  if (!identity) return { phrases, covered: {}, centerPhrase: '', centerPhraseSet: false, wonAt: null };
  const board = getPersonalBingoBoard(state, identity.playerKey, false);
  const centerPhrase = String(board?.centerPhrase || '').trim();
  phrases[BINGO_CENTER_INDEX] = centerPhrase || BINGO_CENTER_PLACEHOLDER;
  return {
    phrases,
    covered: board?.covered || {},
    centerPhrase,
    centerPhraseSet: Boolean(centerPhrase),
    wonAt: board?.wonAt || null,
  };
}

export function setPersonalBingoCenter(state: AppState, identity: BingoIdentity, phraseValue: unknown) {
  const phrase = String(phraseValue || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  if (phrase.length < 2) throw new Error('Choose a personal Bingo phrase first.');
  const board = getPersonalBingoBoard(state, identity.playerKey, true)!;
  if (board.covered[String(BINGO_CENTER_INDEX)]) {
    throw new Error('Your center square is already claimed on this card. Change it after the next board reset.');
  }
  board.centerPhrase = phrase;
  board.updatedAt = new Date().toISOString();
  return board;
}

export function resetPersonalBingoProgress(state: AppState) {
  const boards = (state.bingoCards?.personalBoards || {}) as Record<string, PersonalBingoBoard>;
  const now = new Date().toISOString();
  for (const board of Object.values(boards)) {
    board.covered = {};
    delete board.wonAt;
    board.updatedAt = now;
  }
}

export function hasBingo(covered: Record<string, JsonObject>): boolean {
  const claimed = new Set(Object.keys(covered || {}).map((key) => Number(key)).filter(Number.isInteger));
  for (let row = 0; row < 5; row += 1) {
    if ([0, 1, 2, 3, 4].map((offset) => row * 5 + offset).every((square) => claimed.has(square))) return true;
  }
  for (let col = 0; col < 5; col += 1) {
    if ([0, 1, 2, 3, 4].map((offset) => col + offset * 5).every((square) => claimed.has(square))) return true;
  }
  return [0, 6, 12, 18, 24].every((square) => claimed.has(square))
    || [4, 8, 12, 16, 20].every((square) => claimed.has(square));
}
