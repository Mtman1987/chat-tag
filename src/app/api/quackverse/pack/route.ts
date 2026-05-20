import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserFromRequest, isBotRequest } from '@/lib/auth';
import { isAdminUsername } from '@/lib/admin';
import { getCollectionForUser, normalizeQuackverseUserId, quackverseUserIdFromSession } from '@/lib/quackverse-access';
import { quackverseCards } from '@/lib/quackverse-data';
import { openQuackverseBoosterPack } from '@/lib/quackverse-packs';
import { makeId, updateAppState, readAppState } from '@/lib/volume-store';
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
    deckWins: Number(collection.deckWins || 0),
    deckLosses: Number(collection.deckLosses || 0),
    lastPack: collection.lastPack,
    openedToday,
    packsRemaining: Math.max(0, quackverseDailyPackLimit - openedToday),
    dailyLimit: quackverseDailyPackLimit,
  };
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
  const action = String(body?.action || 'open');
  const { userId, twitchUsername } = resolveRequestUser(req, body);
  if (!userId) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const result = await updateAppState((appState) => {
    // Packs/collection are not room-based; keep them on the legacy `quackverse` state.
    const state = normalizeQuackverseState(appState.quackverse as Partial<QuackverseSavedState>);

    const collection = getCollectionForUser(state, userId);
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
          id: makeId('qpack'),
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
      return { collection, pack };
    }

    if (action === 'addToDeck') {
      const cardId = Number(body.cardId);
      if (!quackverseCards.some((card) => card.id === cardId)) return { error: 'Card not found.', status: 404, collection };
      if (!canAddToDeck(collection.cards, collection.deck, cardId)) return { error: 'No available owned copy for deck.', status: 400, collection };
      collection.deck = [...collection.deck, cardId];
      state.updatedAt = new Date().toISOString();
      appState.quackverse = state;
      return { collection };
    }

    if (action === 'removeFromDeck') {
      const cardId = Number(body.cardId);
      const index = collection.deck.indexOf(cardId);
      if (index !== -1) collection.deck = collection.deck.filter((_, itemIndex) => itemIndex !== index);
      state.updatedAt = new Date().toISOString();
      appState.quackverse = state;
      return { collection };
    }

    return { error: 'Invalid pack action.', status: 400, collection };
  });

  const payload = {
    ...publicCollection((result as any).collection),
    pack: Array.isArray((result as any).pack) ? (result as any).pack : undefined,
  };
  if ((result as any).error) {
    return NextResponse.json({ ...payload, error: (result as any).error }, { status: (result as any).status || 400 });
  }
  return NextResponse.json(payload);
}
