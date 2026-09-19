import { makeId, type JsonObject } from '@/lib/volume-store';
import { normalizeGameHubChannel } from '@/lib/game-hub-state';

export const DANCE_PARTY_DURATION_MS = 75_000;
export const DANCE_PARTY_REDEEM_COOLDOWN_MS = 15 * 60 * 1000;
export const DANCE_PARTY_THEME_COUNT = 5;
export const DANCE_PARTY_MAX_EMOJIS = 120;

export type DancingParadeParticipant = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  joinedAvatar: boolean;
  participatedAt: string;
};

export type DancingParadeSession = {
  id: string;
  channel: string;
  trigger: 'raid' | 'redeem' | 'manual';
  triggerUser: string;
  startedAt: string;
  endsAt: string;
  themeIndex: number;
  danceSeq: number;
  lastDanceAt: string;
  participants: Record<string, DancingParadeParticipant>;
  participantOrder: string[];
  emojis: string[];
  endedAt?: string;
};

type DancingParadeChannelState = {
  active?: DancingParadeSession | null;
  nextTheme?: number;
  lastRedeemAt?: string;
  recent?: DancingParadeSession[];
};

type DancingParadeStore = {
  channels: Record<string, DancingParadeChannelState>;
};

function paradeStore(state: any): DancingParadeStore {
  state.gameSettings ||= { default: {} };
  state.gameSettings.default ||= {};
  const root = (state.gameSettings.default.dancingParade ||= {}) as JsonObject;
  root.channels ||= {};
  return root as unknown as DancingParadeStore;
}

function channelState(state: any, channelValue: unknown): { channel: string; value: DancingParadeChannelState } {
  const channel = normalizeGameHubChannel(channelValue);
  if (!channel) throw new Error('A valid parade channel is required.');
  const store = paradeStore(state);
  return { channel, value: (store.channels[channel] ||= {}) };
}

function activeSession(value: DancingParadeChannelState, nowMs = Date.now()): DancingParadeSession | null {
  const active = value.active || null;
  if (!active) return null;
  if (Date.parse(active.endsAt) <= nowMs) return null;
  return active;
}

export function getDancingParadeSnapshot(state: any, channelValue: unknown, nowMs = Date.now()) {
  const { channel, value } = channelState(state, channelValue);
  const active = activeSession(value, nowMs);
  return {
    channel,
    active: Boolean(active),
    session: active,
    redeemCooldownMs: DANCE_PARTY_REDEEM_COOLDOWN_MS,
    redeemReadyAt: value.lastRedeemAt
      ? new Date(Date.parse(value.lastRedeemAt) + DANCE_PARTY_REDEEM_COOLDOWN_MS).toISOString()
      : null,
  };
}

export function startDancingParade(
  state: any,
  input: { channel: unknown; trigger?: unknown; triggerUser?: unknown; now?: number },
) {
  const nowMs = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  const { channel, value } = channelState(state, input.channel);
  const existing = activeSession(value, nowMs);
  if (existing) return { started: false, reason: 'already-active' as const, session: existing };

  const triggerValue = String(input.trigger || 'manual').trim().toLowerCase();
  const trigger: DancingParadeSession['trigger'] =
    triggerValue === 'raid' ? 'raid' : triggerValue === 'redeem' ? 'redeem' : 'manual';

  if (trigger === 'redeem' && value.lastRedeemAt) {
    const readyAt = Date.parse(value.lastRedeemAt) + DANCE_PARTY_REDEEM_COOLDOWN_MS;
    if (readyAt > nowMs) {
      return {
        started: false,
        reason: 'redeem-cooldown' as const,
        retryAfterMs: readyAt - nowMs,
        session: null,
      };
    }
  }

  const themeIndex = Math.max(0, Number(value.nextTheme || 0)) % DANCE_PARTY_THEME_COUNT;
  const nowIso = new Date(nowMs).toISOString();
  const session: DancingParadeSession = {
    id: makeId('dance_party'),
    channel,
    trigger,
    triggerUser: normalizeGameHubChannel(input.triggerUser),
    startedAt: nowIso,
    endsAt: new Date(nowMs + DANCE_PARTY_DURATION_MS).toISOString(),
    themeIndex,
    danceSeq: 0,
    lastDanceAt: '',
    participants: {},
    participantOrder: [],
    emojis: [],
  };
  value.active = session;
  value.nextTheme = (themeIndex + 1) % DANCE_PARTY_THEME_COUNT;
  if (trigger === 'redeem') value.lastRedeemAt = nowIso;
  return { started: true, reason: 'started' as const, session };
}

export function addDancingParadeParticipant(
  state: any,
  input: {
    channel: unknown;
    userId?: unknown;
    username?: unknown;
    displayName?: unknown;
    avatarUrl?: unknown;
    joinedAvatar?: boolean;
    now?: number;
  },
) {
  const nowMs = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  const { value } = channelState(state, input.channel);
  const session = activeSession(value, nowMs);
  if (!session) return { active: false, participant: null, session: null };

  const username = normalizeGameHubChannel(input.username);
  if (!username) return { active: true, participant: null, session };
  const current = session.participants[username];
  const participant: DancingParadeParticipant = {
    userId: String(input.userId || current?.userId || username).trim().slice(0, 100),
    username,
    displayName: String(input.displayName || current?.displayName || username).trim().slice(0, 80) || username,
    avatarUrl: String(input.avatarUrl || current?.avatarUrl || '').trim().slice(0, 1000),
    joinedAvatar: Boolean(input.joinedAvatar || current?.joinedAvatar),
    participatedAt: current?.participatedAt || new Date(nowMs).toISOString(),
  };
  session.participants[username] = participant;
  if (!session.participantOrder.includes(username)) session.participantOrder.push(username);
  return { active: true, participant, session };
}

export function addDancingParadeEmojis(
  state: any,
  input: { channel: unknown; emojis: unknown[]; now?: number },
) {
  const nowMs = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  const { value } = channelState(state, input.channel);
  const session = activeSession(value, nowMs);
  if (!session) return { active: false, added: [] as string[], session: null };
  const added = (Array.isArray(input.emojis) ? input.emojis : [])
    .map((emoji) => String(emoji || '').trim())
    .filter(Boolean)
    .slice(0, 5);
  session.emojis = [...session.emojis, ...added].slice(-DANCE_PARTY_MAX_EMOJIS);
  return { active: true, added, session };
}

export function triggerDancingParadeDance(state: any, channelValue: unknown, nowMs = Date.now()) {
  const { value } = channelState(state, channelValue);
  const session = activeSession(value, nowMs);
  if (!session) return { active: false, session: null };
  session.danceSeq += 1;
  session.lastDanceAt = new Date(nowMs).toISOString();
  return { active: true, session };
}

export function finishDueDancingParades(state: any, nowMs = Date.now()): DancingParadeSession[] {
  const store = paradeStore(state);
  const ended: DancingParadeSession[] = [];
  for (const value of Object.values(store.channels)) {
    const session = value.active || null;
    if (!session || Date.parse(session.endsAt) > nowMs) continue;
    session.endedAt = new Date(nowMs).toISOString();
    value.recent = [...(Array.isArray(value.recent) ? value.recent : []), session].slice(-12);
    value.active = null;
    ended.push(session);
  }
  return ended;
}

export function extractParadeEmojis(value: unknown): string[] {
  const text = String(value || '');
  const matches = text.match(/(?:\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)/gu) || [];
  return matches.slice(0, 5);
}
