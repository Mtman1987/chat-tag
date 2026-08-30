import { getBotSecret } from '@/lib/runtime-secrets';

export type QuackversePackMediaCard = {
  id?: string | number;
  name: string;
  rarity?: string;
  type?: string;
  cardImageUrl?: string;
  imageUrl?: string;
};

export type QuackversePackMediaEvent = {
  eventId: string;
  type: 'card-pack-opened';
  game: 'quackverse';
  username: string;
  setName: 'Quackverse';
  cards: Array<{
    id?: string;
    number?: string;
    name: string;
    rarity?: string;
    setCode: 'QV';
    imageUrl: string;
  }>;
  openedAt: string;
};

const DSH_URL = String(
  process.env.DISCORD_STREAM_HUB_URL
    || process.env.NEXT_PUBLIC_DISCORD_STREAM_HUB_URL
    || 'https://discord-stream-hub-new.fly.dev',
).replace(/\/$/, '');

const STREAMWEAVER_URL = String(
  process.env.STREAMWEAVER_URL
    || process.env.STREAMWEAVE_URL
    || 'https://streamweaver-new.fly.dev',
).replace(/\/$/, '');

function encodeEvent(event: QuackversePackMediaEvent): string {
  return Buffer.from(JSON.stringify(event), 'utf8').toString('base64url');
}

export function createQuackversePackMediaEvent(input: {
  eventId: string;
  username: string;
  cards: QuackversePackMediaCard[];
}): QuackversePackMediaEvent {
  const eventId = String(input.eventId || '').trim().replace(/[^a-zA-Z0-9._:-]+/g, '-').slice(0, 120);
  if (!eventId) throw new Error('Quackverse pack media requires an event id.');
  const cards = input.cards.map((card) => ({
    id: card.id === undefined ? undefined : String(card.id),
    number: card.id === undefined ? undefined : String(card.id),
    name: String(card.name || 'Unknown Card').slice(0, 100),
    rarity: String(card.rarity || '').slice(0, 60) || undefined,
    setCode: 'QV' as const,
    imageUrl: String(card.cardImageUrl || card.imageUrl || '').trim(),
  })).filter((card) => /^https?:\/\//i.test(card.imageUrl)).slice(0, 12);
  if (!cards.length) throw new Error('Quackverse pack media requires card images.');
  return {
    eventId,
    type: 'card-pack-opened',
    game: 'quackverse',
    username: String(input.username || 'player').trim().slice(0, 80) || 'player',
    setName: 'Quackverse',
    cards,
    openedAt: new Date().toISOString(),
  };
}

export function quackversePackRenderUrl(event: QuackversePackMediaEvent): string {
  return `${STREAMWEAVER_URL}/overlay/card-pack?event=${encodeURIComponent(encodeEvent(event))}&capture=1`;
}

async function dshRequest(path: string, init: RequestInit) {
  const response = await fetch(`${DSH_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getBotSecret()}`,
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`DSH pack media failed ${response.status}: ${await response.text().catch(() => '')}`);
  return response.json() as Promise<any>;
}

export async function queueQuackversePackGif(event: QuackversePackMediaEvent) {
  return dshRequest('/api/internal/card-pack/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId: event.eventId, source: 'quackverse', renderUrl: quackversePackRenderUrl(event) }),
  });
}

export async function waitForQuackversePackGif(eventId: string, timeoutMs = 120_000): Promise<string | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const data = await dshRequest(`/api/internal/card-pack/render?id=${encodeURIComponent(eventId)}`, { method: 'GET' });
    const job = data?.job;
    if (job?.status === 'ready' && /^https?:\/\//i.test(String(job.gifUrl || ''))) return String(job.gifUrl);
    if (job?.status === 'failed') return null;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  return null;
}
