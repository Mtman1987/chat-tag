import { makeId } from '@/lib/volume-store';

export type NebulaChatEvent = {
  id: string;
  at: string;
  channel: string;
  username: string;
  userId: string;
  displayName: string;
  message: string;
  color: string;
  badges: Record<string, unknown>;
  gameIds: string[];
};

const MAX_EVENTS_PER_CHANNEL = 250;
const MAX_EVENT_AGE_MS = 10 * 60 * 1000;
const globalBus = globalThis as typeof globalThis & {
  __nebulaArcadeChatEvents?: Map<string, NebulaChatEvent[]>;
};
const eventsByChannel = globalBus.__nebulaArcadeChatEvents ||= new Map<string, NebulaChatEvent[]>();

export function appendNebulaChatEvent(input: Omit<NebulaChatEvent, 'id' | 'at'>): NebulaChatEvent {
  const event: NebulaChatEvent = { ...input, id: makeId('game_chat'), at: new Date().toISOString() };
  const cutoff = Date.now() - MAX_EVENT_AGE_MS;
  const current = eventsByChannel.get(event.channel) || [];
  eventsByChannel.set(event.channel, [...current, event]
    .filter((item) => Date.parse(item.at) >= cutoff)
    .slice(-MAX_EVENTS_PER_CHANNEL));
  return event;
}

export function getNebulaChatEvents(channel: string, after = '', limit = 100): NebulaChatEvent[] {
  const cutoff = Date.now() - MAX_EVENT_AGE_MS;
  const current = (eventsByChannel.get(channel) || []).filter((item) => Date.parse(item.at) >= cutoff);
  const afterIndex = after ? current.findIndex((item) => item.id === after) : -1;
  return (afterIndex >= 0 ? current.slice(afterIndex + 1) : current).slice(-Math.max(1, Math.min(100, limit)));
}
