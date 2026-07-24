import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserFromRequest, isBotRequest } from '@/lib/auth';
import { isAdminUsername } from '@/lib/admin';
import { getCollectionForUser, normalizeQuackverseUserId, quackverseUserIdFromSession } from '@/lib/quackverse-access';
import { quackverseCards } from '@/lib/quackverse-data';
import { openQuackverseBoosterPack } from '@/lib/quackverse-packs';
import { lookupTwitchUser } from '@/lib/twitch';
import { makeId, updateAppState, readAppState } from '@/lib/volume-store';
import { getPublicAppOrigin } from '@/lib/public-origin';
import { getStreamweaverSecret } from '@/lib/runtime-secrets';
import {
  normalizeQuackverseState,
  quackverseDailyPackLimit,
  quackverseDayKey,
  type QuackverseSavedState,
} from '@/lib/quackverse-state';

function publicCollection(collection: ReturnType<typeof getCollectionForUser>) {
  const today = quackverseDayKey();
  const openedToday = collection.openedAtDay === today ? collection.openedToday : 0;
  return {
    cards: collection.cards,
    deck: collection.deck,
    activeDeckId: collection.activeDeckId,
    savedDecks: collection.savedDecks,
    deckWins: Number(collection.deckWins || 0),
    deckLosses: Number(collection.deckLosses || 0),
    lastPack: collection.lastPack,
    openedToday,
    packsRemaining: Math.max(0, quackverseDailyPackLimit - openedToday),
    dailyLimit: quackverseDailyPackLimit,
  };
}

const STREAMWEAVER_URL = (process.env.STREAMWEAVER_URL || process.env.STREAMWEAVE_URL || 'https://streamweaver-new.fly.dev').replace(/\/$/, '');

function getStreamWeaverOverlaySecret() {
  try {
    return getStreamweaverSecret();
  } catch (error) {
    console.warn('[Quackverse] StreamWeaver overlay secret unavailable:', error instanceof Error ? error.message : error);
    return '';
  }
}

function normalizeOverlayTenantId(value: unknown) {
  return String(value || '').trim().replace(/^user_/, '') || undefined;
}

function absoluteUrl(origin: string, value: string) {
  try {
    return new URL(value, origin).toString();
  } catch {
    return value;
  }
}

function resolvePublicOrigin(req: NextRequest, body?: any) {
  const fromBody = String(body?.publicOrigin || '').trim();
  if (fromBody) {
    try {
      const url = new URL(fromBody);
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        return url.toString().replace(/\/$/, '');
      }
    } catch {
      // Ignore malformed caller hints and use the normal public-origin resolver.
    }
  }
  return getPublicAppOrigin(req);
}

function quackverseOverlayCard(card: any, origin: string) {
  const artUrl = card?.artUrl || card?.artHoverUrl || '';
  return {
    id: `qv-${card.id}`,
    number: String(card.id),
    name: card.name,
    rarity: card.rarity || 'Unknown',
    setCode: 'QV',
    imageUrl: artUrl ? absoluteUrl(origin, artUrl) : `${origin}/api/quackverse/pack/image?packId=__PACK_ID__`,
  };
}

async function notifyStreamWeaverPackOverlay(input: {
  origin: string;
  username: string;
  packId: string;
  pack: any[];
  tenantId?: string;
}) {
  const secret = getStreamWeaverOverlaySecret();
  if (!secret || !STREAMWEAVER_URL || !input.origin) return;

  const packImageUrl = `${input.origin}/api/quackverse/pack/image?packId=${encodeURIComponent(input.packId)}&t=${Date.now()}`;
  const pack = input.pack.map((card) => {
    const normalized = quackverseOverlayCard(card, input.origin);
    return {
      ...normalized,
      imageUrl: normalized.imageUrl.includes('__PACK_ID__')
        ? normalized.imageUrl.replace('__PACK_ID__', encodeURIComponent(input.packId))
        : normalized.imageUrl,
    };
  });

  const response = await fetch(`${STREAMWEAVER_URL}/api/quackverse/pack-overlay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({
      username: input.username,
      setName: 'Quackverse',
      pack,
      packImageUrl,
      tenantId: input.tenantId,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.warn('[Quackverse] StreamWeaver overlay notify failed:', response.status, detail.slice(0, 300));
  }
}

function summarizePackAudit(events: any[]) {
  const rarityCounts: Record<string, number> = {};
  const cardCounts: Record<string, number> = {};
  const perDay: Record<string, number> = {};

  for (const event of events) {
    perDay[event.day] = (perDay[event.day] || 0) + 1;
    for (const card of event.cards || []) {
      const rarity = card.rarity || 'Unknown';
      rarityCounts[rarity] = (rarityCounts[rarity] || 0) + 1;
      cardCounts[card.name] = (cardCounts[card.name] || 0) + 1;
    }
  }

  return {
    totalPacks: events.length,
    totalCards: events.reduce((sum, event) => sum + Number(event.cards?.length || 0), 0),
    rarityCounts,
    perDay,
    mostPulledCards: Object.entries(cardCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 10),
  };
}

function canAddToDeck(cards: number[], deck: number[], cardId: number) {
  if (deck.length >= 20) return false;
  const ownedCount = cards.filter((id) => id === cardId).length;
  const deckCount = deck.filter((id) => id === cardId).length;
  return ownedCount > deckCount;
}

function resolveRequestUser(req: NextRequest, body?: any) {
  const sessionUser = getSessionUserFromRequest(req);
  if (isBotRequest(req)) {
    return {
      userId: normalizeQuackverseUserId(body?.userId),
      twitchUsername: String(body?.twitchUsername || '').toLowerCase(),
    };
  }
  return {
    userId: quackverseUserIdFromSession(sessionUser),
    twitchUsername: sessionUser?.twitchUsername || '',
  };
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('recent') === '1') {
    const limit = Math.max(1, Math.min(12, Number(req.nextUrl.searchParams.get('limit') || 5) || 5));
    const origin = getPublicAppOrigin(req);
    const appState = await readAppState();
    const events = Array.isArray(appState.quackversePackOpens) ? appState.quackversePackOpens : [];
    return NextResponse.json({
      events: events.slice(0, limit).map((event: any) => ({
        id: String(event?.id || ''),
        at: String(event?.at || ''),
        twitchUsername: String(event?.twitchUsername || ''),
        packNumberToday: Number(event?.packNumberToday || 0),
        packsRemaining: Number(event?.packsRemaining || 0),
        cards: Array.isArray(event?.cards) ? event.cards.slice(0, 5) : [],
        packImageUrl: origin && event?.id ? `${origin}/api/quackverse/pack/image?packId=${encodeURIComponent(String(event.id))}` : '',
      })).filter((event: any) => event.id),
    });
  }

  if (req.nextUrl.searchParams.get('audit') === '1') {
    const sessionUser = getSessionUserFromRequest(req);
    if (!isAdminUsername(sessionUser?.twitchUsername)) {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
    }

    const appState = await readAppState();
    const events = Array.isArray(appState.quackversePackOpens) ? [...appState.quackversePackOpens] : [];
    events.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    return NextResponse.json({
      events: events.slice(0, 200),
      summary: summarizePackAudit(events),
    });
  }

  const { userId } = resolveRequestUser(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const appState = await readAppState();
  const state = normalizeQuackverseState(appState.quackverse as Partial<QuackverseSavedState>);
  const collection = getCollectionForUser(state, userId);
  return NextResponse.json(publicCollection(collection));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const publicOrigin = resolvePublicOrigin(req, body);
  const action = String(body?.action || 'open');
  const { userId, twitchUsername } = resolveRequestUser(req, body);
  if (!userId) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const normalizedUsername = String(twitchUsername || '').trim().toLowerCase();
  const overlayTenantId = normalizeOverlayTenantId(body?.streamweaverTenantId || body?.tenantId || body?.streamerId);
  const twitchProfile = normalizedUsername ? await lookupTwitchUser(normalizedUsername).catch(() => null) : null;
  const userRecordId = String(body?.twitchUserId || twitchProfile?.id || userId.replace(/^user_/, '') || '').trim();

  const result = await updateAppState((appState) => {
    // Packs/collection are not room-based; keep them on the legacy `quackverse` state.
    const state = normalizeQuackverseState(appState.quackverse as Partial<QuackverseSavedState>);
    const rootState = appState as any;

    const collection = getCollectionForUser(state, userId);
    if (normalizedUsername && userRecordId) {
      rootState.users = rootState.users || {};
      rootState.users[userRecordId] = {
        ...(rootState.users[userRecordId] || {}),
        id: userRecordId,
        twitchUsername: normalizedUsername,
        avatarUrl: twitchProfile?.profile_image_url || body?.avatarUrl || body?.avatar || rootState.users[userRecordId]?.avatarUrl || '',
      };
    }

    const today = quackverseDayKey();
    if (collection.openedAtDay !== today) {
      collection.openedAtDay = today;
      collection.openedToday = 0;
    }

    if (action === 'open') {
      if (collection.openedToday >= quackverseDailyPackLimit) {
        appState.quackverse = state;
        return { error: 'Daily pack limit reached.', status: 429, collection };
      }
      const pack = openQuackverseBoosterPack();
      collection.openedToday += 1;
      collection.lastPack = pack.map((card) => card.id);
      collection.cards = [...collection.cards, ...collection.lastPack];
      state.updatedAt = new Date().toISOString();
      appState.quackverse = state;
      const packId = makeId('qpack');
      const cards = pack.map((card) => ({
        id: card.id,
        name: card.name,
        type: card.type,
        rarity: card.rarity || 'Unknown',
      }));
      const rarityCounts = cards.reduce<Record<string, number>>((acc, card) => {
        acc[card.rarity] = (acc[card.rarity] || 0) + 1;
        return acc;
      }, {});
      appState.quackversePackOpens = [
        {
          id: packId,
          at: new Date().toISOString(),
          day: today,
          userId,
          twitchUsername: twitchUsername.toLowerCase(),
          packNumberToday: collection.openedToday,
          packsRemaining: Math.max(0, quackverseDailyPackLimit - collection.openedToday),
          collectionSizeAfter: collection.cards.length,
          uniqueCardsAfter: new Set(collection.cards).size,
          cards,
          rarityCounts,
        },
        ...(Array.isArray(appState.quackversePackOpens) ? appState.quackversePackOpens : []),
      ].slice(0, 1000);
      return { collection, pack, packId };
    }

    if (action === 'addToDeck') {
      const cardId = Number(body.cardId);
      if (!quackverseCards.some((card) => card.id === cardId)) return { error: 'Card not found.', status: 404, collection };
      if (!canAddToDeck(collection.cards, collection.deck, cardId)) return { error: 'No available owned copy for deck.', status: 400, collection };
      collection.deck = [...collection.deck, cardId];
      collection.activeDeckId = 'default';
      state.updatedAt = new Date().toISOString();
      appState.quackverse = state;
      return { collection };
    }

    if (action === 'removeFromDeck') {
      const cardId = Number(body.cardId);
      const index = collection.deck.indexOf(cardId);
      if (index !== -1) collection.deck = collection.deck.filter((_, itemIndex) => itemIndex !== index);
      collection.activeDeckId = 'default';
      state.updatedAt = new Date().toISOString();
      appState.quackverse = state;
      return { collection };
    }

    if (action === 'saveDeck') {
      const name = String(body.name || 'Saved Deck').trim().slice(0, 40) || 'Saved Deck';
      const now = new Date().toISOString();
      const deckId = String(body.deckId || '').trim() || makeId('qdeck');
      const existing = collection.savedDecks.find((deck) => deck.id === deckId);
      const savedDeck = {
        id: deckId,
        name,
        cardIds: collection.deck.slice(0, 20),
        wins: Number(existing?.wins || 0),
        losses: Number(existing?.losses || 0),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      collection.savedDecks = [savedDeck, ...collection.savedDecks.filter((deck) => deck.id !== deckId)].slice(0, 12);
      collection.activeDeckId = deckId;
      state.updatedAt = now;
      appState.quackverse = state;
      return { collection };
    }

    if (action === 'activateDeck') {
      const deckId = String(body.deckId || '').trim();
      const savedDeck = collection.savedDecks.find((deck) => deck.id === deckId);
      if (!savedDeck) return { error: 'Saved deck not found.', status: 404, collection };
      collection.deck = savedDeck.cardIds.slice(0, 20);
      collection.activeDeckId = savedDeck.id;
      state.updatedAt = new Date().toISOString();
      appState.quackverse = state;
      return { collection };
    }

    return { error: 'Invalid pack action.', status: 400, collection };
  });

  const payload = {
    ...publicCollection((result as any).collection),
    pack: Array.isArray((result as any).pack) ? (result as any).pack : undefined,
    packId: typeof (result as any).packId === 'string' ? (result as any).packId : undefined,
    packImageUrl: publicOrigin && typeof (result as any).packId === 'string'
      ? `${publicOrigin}/api/quackverse/pack/image?packId=${encodeURIComponent((result as any).packId)}`
      : undefined,
  };
  if ((result as any).error) {
    return NextResponse.json({ ...payload, error: (result as any).error }, { status: (result as any).status || 400 });
  }
  if (payload.packId && Array.isArray(payload.pack)) {
    notifyStreamWeaverPackOverlay({
      origin: publicOrigin,
      username: normalizedUsername || userRecordId || userId,
      packId: payload.packId,
      pack: payload.pack,
      tenantId: overlayTenantId,
    }).catch((error) => {
      console.warn('[Quackverse] StreamWeaver overlay notify failed:', error instanceof Error ? error.message : error);
    });
  }
  return NextResponse.json(payload);
}
