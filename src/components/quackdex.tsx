'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Search, X, Plus, Minus, ArrowRight, ArrowLeftRight, Layers, Users, RefreshCw, PackageOpen } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { quackverseCards, type QuackverseCard } from '@/lib/quackverse-data';
import type { QuackverseTradeOffer } from '@/lib/quackverse-trades';
import { getAuthHeaders } from '@/lib/client-auth';
import { useSession } from '@/contexts/session-context';

type Deck = { id: string; name: string; cardIds: number[]; wins: number; losses: number };
type Collection = { cards: number[]; deck: number[]; savedDecks: Deck[]; activeDeckId: string; packsRemaining: number; dailyLimit: number; lastPack: number[] };
type Player = { userId: string; username: string; cards: number[]; spareCards?: { cardId: number; quantity: number }[] };
type Directory = { userId: string; players: Player[]; offers: QuackverseTradeOffer[]; spareCards: { cardId: number; quantity: number }[] };
type View = 'My Cards' | 'All Cards' | 'Deck Builder' | 'Players' | 'Trades';
const views: View[] = ['My Cards', 'All Cards', 'Deck Builder', 'Players', 'Trades'];
const cardById = new Map(quackverseCards.map(card => [card.id, card]));
const count = (ids: number[], id: number) => ids.filter(value => value === id).length;
const image = (id: number) => `/api/quackverse/pack-preview?ids=${id}&mode=card`;
const rarityColor: Record<string, string> = { Common: 'text-slate-300', Uncommon: 'text-emerald-300', Rare: 'text-sky-300', Epic: 'text-violet-300', Legendary: 'text-amber-300' };
const inputClass = 'min-h-11 rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20';
const buttonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-amber-300/50 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40';
const primaryClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-300/40 bg-amber-300 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40';

function CardTile({ card, quantity, onInspect, action, selected }: { card: QuackverseCard; quantity: number; onInspect: () => void; action?: React.ReactNode; selected?: boolean }) {
  return <article className={`overflow-hidden rounded-2xl border bg-slate-900/70 ${selected ? 'border-amber-300 ring-2 ring-amber-300/20' : 'border-white/10'}`}>
    <button type="button" onClick={onInspect} aria-label={`Read ${card.name}`} className="group block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">
      <div className="relative aspect-[5/7] bg-slate-950 p-2">
        <img src={image(card.id)} alt={card.name} loading="lazy" className="h-full w-full rounded-xl object-contain transition duration-200 group-hover:scale-[1.025]" />
        <span className="absolute left-3 top-3 rounded-lg bg-slate-950/90 px-2 py-1 text-[11px] font-bold text-slate-300">#{String(card.id).padStart(3, '0')}</span>
        <span className={`absolute bottom-3 right-3 rounded-lg px-2 py-1 text-xs font-bold ${quantity ? 'bg-amber-300 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>{quantity ? `Owned ×${quantity}` : 'Not owned'}</span>
      </div>
      <div className="px-3 pb-3 pt-1"><h3 className="text-sm font-bold leading-snug text-white">{card.name}</h3><p className={`mt-1 text-xs ${rarityColor[card.rarity]}`}>{card.rarity} · {card.type === 'Duck' ? card.family : 'Equipment'}</p></div>
    </button>
    {action ? <div className="border-t border-white/10 p-2">{action}</div> : null}
  </article>;
}

export function Quackdex() {
  const { user } = useSession();
  const [view, setView] = useState<View>('My Cards');
  const [collection, setCollection] = useState<Collection | null>(null);
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [search, setSearch] = useState('');
  const [rarity, setRarity] = useState('All');
  const [kind, setKind] = useState('All');
  const [ownership, setOwnership] = useState('All');
  const [sort, setSort] = useState('Number');
  const [inspected, setInspected] = useState<number | null>(null);
  const [targetId, setTargetId] = useState('');
  const [giveId, setGiveId] = useState<number | null>(null);
  const [wantId, setWantId] = useState<number | null>(null);
  const [deckName, setDeckName] = useState('My first deck');
  const [editingDeckId, setEditingDeckId] = useState('');
  const initialized = useRef(false);

  const refresh = useCallback(async () => {
    const responses = await Promise.all([
      fetch('/api/quackverse/pack', { cache: 'no-store', headers: getAuthHeaders() }),
      fetch('/api/quackverse/quackdex', { cache: 'no-store', headers: getAuthHeaders() }),
    ]);
    if (responses.some(response => response.status === 401)) { setNeedsSignIn(true); setCollection(null); setDirectory(null); return; }
    const bodies = await Promise.all(responses.map(response => response.json()));
    if (responses.some(response => !response.ok)) throw new Error(bodies.find(body => body.error)?.error || 'Could not load your Quackdex. Try Refresh.');
    const next = bodies[0] as Collection;
    setCollection(next); setDirectory(bodies[1]); setNeedsSignIn(false);
    if (!initialized.current) {
      initialized.current = true;
      const active = next.savedDecks.find(deck => deck.id === next.activeDeckId);
      if (active) { setEditingDeckId(active.id); setDeckName(active.name); }
    }
  }, []);

  useEffect(() => {
    initialized.current = false; setLoading(true);
    void refresh().catch(error => setNotice(error.message)).finally(() => setLoading(false));
    const timer = setInterval(() => { if (!busyRef.current) void refresh().catch(error => setNotice(error.message)); }, 15000);
    return () => clearInterval(timer);
  }, [refresh, user?.twitchUsername]);

  async function act(endpoint: 'pack' | 'quackdex', body: Record<string, unknown>, success: string) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setNotice('');
    try {
      const response = await fetch(`/api/quackverse/${endpoint}`, { method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'That action could not be completed.');
      if (endpoint === 'pack' && Array.isArray(result.cards)) setCollection(result);
      if (body.action === 'saveDeck') setEditingDeckId(result.activeDeckId);
      if (body.action === 'open') { setView('My Cards'); setSearch(''); setOwnership('All'); setKind('All'); setRarity('All'); setInspected(result.lastPack?.[0] ?? null); }
      await refresh(); setNotice(success);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'That action could not be completed.'); }
    finally { busyRef.current = false; setBusy(false); }
  }

  const owned = collection?.cards || [];
  const deck = collection?.deck || [];
  const target = directory?.players.find(player => player.userId === targetId);
  const viewedCards = view === 'Players' ? target?.cards || [] : owned;
  const spare = directory?.spareCards.filter(card => card.quantity > 0) || [];
  const targetSpare = target?.spareCards?.filter(card => card.quantity > 0) || [];
  const pendingOffers = directory?.offers.filter(offer => offer.status === 'pending' && Date.parse(offer.expiresAt) > Date.now()) || [];
  const filtered = useMemo(() => quackverseCards.filter(card => {
    const quantity = count(viewedCards, card.id);
    if ((view === 'My Cards' || view === 'Deck Builder' || view === 'Players') && !quantity) return false;
    if (ownership === 'Owned' && !quantity) return false;
    if (ownership === 'Missing' && quantity) return false;
    if (ownership === 'Duplicates' && quantity < 2) return false;
    if (rarity !== 'All' && card.rarity !== rarity) return false;
    if (kind !== 'All' && card.type !== kind) return false;
    return `${card.name} ${card.id} ${card.family} ${card.role || ''} ${card.text}`.toLowerCase().includes(search.trim().toLowerCase());
  }).sort((a, b) => sort === 'Name' ? a.name.localeCompare(b.name) : sort === 'Rarity' ? ['Legendary', 'Epic', 'Rare', 'Uncommon', 'Common'].indexOf(a.rarity) - ['Legendary', 'Epic', 'Rare', 'Uncommon', 'Common'].indexOf(b.rarity) || a.id - b.id : a.id - b.id), [viewedCards, view, ownership, rarity, kind, search, sort]);
  const selectedCard = inspected === null ? null : cardById.get(inspected);
  const canAdd = (id: number) => !busy && Boolean(collection) && deck.length < 20 && count(owned, id) > count(deck, id);
  function changeView(next: View) { setView(next); setSearch(''); setOwnership('All'); setKind('All'); setRarity('All'); }
  function choosePlayer(id: string) { setTargetId(id); setWantId(null); setSearch(''); }
  function startTrade(id?: number) { setGiveId(id && spare.some(card => card.cardId === id) ? id : null); setInspected(null); changeView('Trades'); }
  const inspect = (card: QuackverseCard) => setInspected(card.id);

  return <div className="overflow-hidden rounded-3xl border border-amber-300/20 bg-[#0c1220] text-slate-100" data-testid="quackdex">
    <header className="border-b border-amber-300/15 bg-gradient-to-r from-[#22203b] via-[#17243b] to-[#111a2b] p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4"><span className="grid h-14 w-14 place-items-center rounded-2xl border border-amber-300/30 bg-amber-300/10 text-amber-300"><BookOpen size={28} /></span><div><p className="text-[10px] font-bold uppercase tracking-[.24em] text-amber-200/70">Your Quackverse card companion</p><h2 className="mt-1 text-3xl font-black tracking-tight text-amber-200">Quackdex</h2><p className="mt-1 text-sm text-slate-300">Read cards. Build your deck. Find your next trade.</p></div></div>
        <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={busy || loading} onClick={() => { void refresh().then(() => setNotice('Quackdex refreshed.')).catch(error => setNotice(error.message)); }}><RefreshCw size={15} />Refresh</button><button type="button" className={primaryClass} disabled={busy || !collection || collection.packsRemaining <= 0} onClick={() => void act('pack', { action: 'open' }, 'Pack opened! Your new cards are in My Cards.')}><PackageOpen size={17} />{busy ? 'Please wait…' : `Open pack${collection ? ` · ${collection.packsRemaining} left` : ''}`}</button></div>
      </div>
      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-300"><span><strong className="text-lg text-white">{owned.length}</strong> cards owned</span><span><strong className="text-lg text-white">{new Set(owned).size}/{quackverseCards.length}</strong> collected</span><span><strong className="text-lg text-white">{deck.length}/20</strong> in your deck</span><span><strong className="text-lg text-white">{pendingOffers.length}</strong> open trades</span></div>
    </header>
    <nav aria-label="Quackdex sections" className="flex overflow-x-auto border-b border-white/10 bg-slate-950/60 p-2">
      {views.map(item => <button key={item} type="button" aria-current={view === item ? 'page' : undefined} onClick={() => changeView(item)} className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${view === item ? 'bg-amber-300/15 text-amber-200' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>{item === 'Deck Builder' ? <Layers size={16} /> : item === 'Players' ? <Users size={16} /> : item === 'Trades' ? <ArrowLeftRight size={16} /> : <BookOpen size={16} />}{item}{item === 'Trades' && pendingOffers.length ? <span className="rounded-full bg-amber-300 px-2 text-xs text-slate-950">{pendingOffers.length}</span> : null}</button>)}
    </nav>
    {notice ? <div role="status" aria-live="polite" className="m-4 flex items-start justify-between gap-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100"><span>{notice}</span><button type="button" aria-label="Dismiss message" onClick={() => setNotice('')}><X size={17} /></button></div> : null}
    {needsSignIn && view !== 'All Cards' ? <div className="p-8 text-center"><h3 className="text-xl font-bold">Your collection belongs here</h3><p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Sign in to see your cards, save decks, and trade with other players. You can browse every card in All Cards.</p><a href="/api/auth/spmt" className={`${primaryClass} mt-5`}>Sign in with SPMT</a><button type="button" className={`${buttonClass} ml-2 mt-5`} onClick={() => changeView('All Cards')}>Browse all cards</button></div> : loading && view !== 'All Cards' ? <p role="status" className="p-10 text-center text-slate-400">Loading your Quackdex…</p> : <div className="p-4 sm:p-5">
      {view === 'Players' ? <div className="mb-5 rounded-2xl border border-white/10 bg-white/[.03] p-4"><h3 className="font-bold">Explore a player’s collection</h3><p className="mt-1 text-sm text-slate-400">Read their cards, see how many they own, and choose a trade.</p><div className="mt-3 flex flex-wrap gap-3"><select aria-label="Browse player" className={`${inputClass} min-w-0 flex-1`} value={targetId} onChange={event => choosePlayer(event.target.value)}><option value="">Choose a player…</option>{directory?.players.filter(player => player.userId !== directory.userId).map(player => <option key={player.userId} value={player.userId}>@{player.username} · {player.cards.length} cards</option>)}</select><button type="button" className={primaryClass} disabled={!target} onClick={() => startTrade()}>Trade with {target ? `@${target.username}` : 'this player'}<ArrowRight size={16} /></button></div></div> : null}
      {view === 'Trades' ? <div className="space-y-6">
        <section className="rounded-2xl border border-white/10 bg-white/[.03] p-4 sm:p-5"><h3 className="text-xl font-bold">Make a trade</h3><p className="mt-1 text-sm text-slate-400">Choose a player, then one card from each collection. Cards stay with you until they accept.</p><label className="mt-4 block text-sm text-slate-300">Trade partner<select aria-label="Trade partner" className={`${inputClass} mt-1 w-full`} value={targetId} onChange={event => choosePlayer(event.target.value)}><option value="">Choose a player…</option>{directory?.players.filter(player => player.userId !== directory.userId).map(player => <option key={player.userId} value={player.userId}>@{player.username}</option>)}</select></label>
          {target ? <><div className="mt-5 grid gap-4 md:grid-cols-2">{[{ title: 'You give', value: giveId, set: setGiveId, cards: spare }, { title: 'You receive', value: wantId, set: setWantId, cards: targetSpare }].map(side => <div key={side.title} className="rounded-xl border border-white/10 bg-slate-950/50 p-4"><label className="block font-bold text-amber-200">{side.title}<select aria-label={side.title} className={`${inputClass} mt-2 w-full`} value={side.value ?? ''} onChange={event => side.set(event.target.value ? Number(event.target.value) : null)}><option value="">Choose a spare card…</option>{side.cards.map(card => <option key={card.cardId} value={card.cardId}>{cardById.get(card.cardId)?.name} · {card.quantity} available</option>)}</select></label>{side.value && cardById.get(side.value) ? <button type="button" className="mx-auto mt-4 block w-40" aria-label={`Read ${cardById.get(side.value)!.name}`} onClick={() => setInspected(side.value)}><img src={image(side.value)} alt={cardById.get(side.value)!.name} className="w-full rounded-xl" /><span className="mt-2 block text-xs text-slate-400">Click to read this card</span></button> : <p className="mt-5 text-sm text-slate-500">{side.cards.length ? 'Choose a card to preview it here.' : 'No spare cards available. Cards used in saved decks are protected.'}</p>}</div>)}</div><button type="button" className={`${primaryClass} mt-4`} disabled={busy || !giveId || !wantId} onClick={() => void act('quackdex', { action: 'offer', toId: targetId, giveCardId: giveId, wantCardId: wantId }, 'Offer sent. The other player can review it in their Trades tab.')}>Send trade offer<ArrowLeftRight size={16} /></button><p className="mt-3 text-xs leading-relaxed text-slate-400">Only spare copies can be traded. Your current deck and saved decks are protected. Offers expire after 48 hours.</p></> : <p className="mt-4 text-sm text-slate-400">Choose a player to compare cards and start an offer.</p>}
        </section>
        <section><h3 className="text-xl font-bold">Trade inbox</h3><p className="mt-1 text-sm text-slate-400">Incoming offers, offers you sent, and completed trades.</p><div className="mt-4 space-y-4">{!directory?.offers.length ? <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-slate-400">No trade offers yet. Start one above, or ask another player to offer you a card.</div> : directory.offers.map(offer => {
          const incoming = offer.toId === directory.userId;
          const pending = offer.status === 'pending' && Date.parse(offer.expiresAt) > Date.now();
          const give = cardById.get(incoming ? offer.wantCardId : offer.giveCardId), receive = cardById.get(incoming ? offer.giveCardId : offer.wantCardId);
          return <article key={offer.id} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-bold">{incoming ? `From @${offer.fromName}` : `Sent to @${offer.toName}`}</h4><span className={`rounded-full px-3 py-1 text-xs capitalize ${pending ? 'bg-amber-300/15 text-amber-200' : 'bg-white/5 text-slate-400'}`}>{offer.status === 'pending' && !pending ? 'Expired' : offer.status}</span></div><div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">{[give, receive].map((card, index) => <div key={index} className={`min-w-0 ${index ? 'col-start-3' : 'col-start-1'} row-start-1`}><p className="mb-2 text-xs text-slate-400">{index ? 'You receive' : 'You give'}</p>{card ? <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => inspect(card)}><img src={image(card.id)} alt="" className="hidden w-16 rounded-lg sm:block" /><span className="text-sm font-semibold">{card.name}<span className="mt-1 block text-xs font-normal text-slate-400">Read card</span></span></button> : null}</div>)}<ArrowLeftRight className="col-start-2 row-start-1 text-amber-300" size={20} /></div>{pending ? <div className="mt-4 flex flex-wrap gap-2">{incoming ? <><button type="button" className={primaryClass} disabled={busy} onClick={() => void act('quackdex', { action: 'accept', offerId: offer.id }, 'Trade accepted. Both collections have been updated.')}>Accept trade</button><button type="button" className={buttonClass} disabled={busy} onClick={() => void act('quackdex', { action: 'decline', offerId: offer.id }, 'Offer declined.')}>Decline</button></> : <button type="button" className={buttonClass} disabled={busy} onClick={() => void act('quackdex', { action: 'cancel', offerId: offer.id }, 'Offer cancelled.')}>Cancel offer</button>}</div> : null}</article>;
        })}</div></section>
      </div> : <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-xl font-bold">{view === 'Players' && target ? `@${target.username}’s cards` : view === 'All Cards' ? 'Every Quackverse card' : view === 'Deck Builder' ? 'Build your 20-card deck' : 'Your collection'}</h3><p className="mt-1 text-sm text-slate-400">{view === 'Deck Builder' ? 'Add owned copies below. Name your deck when you’re ready to save it.' : 'Click any card to see it full-size and read its abilities.'}</p></div><span className="text-xs text-slate-400">{filtered.length} cards shown</span></div>
        <div className="mb-5 flex flex-wrap gap-2"><label className="relative w-full min-w-0 flex-none sm:flex-1 sm:basis-64"><Search size={17} className="absolute left-3 top-3 text-slate-500" /><input aria-label="Search cards" placeholder="Search names, abilities, families, or card numbers…" className={`${inputClass} w-full pl-10`} value={search} onChange={event => setSearch(event.target.value)} /></label><select aria-label="Card type" className={inputClass} value={kind} onChange={event => setKind(event.target.value)}><option value="All">All types</option><option value="Duck">Ducks</option><option value="Equipment">Equipment</option></select><select aria-label="Card rarity" className={inputClass} value={rarity} onChange={event => setRarity(event.target.value)}>{['All', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'].map(value => <option key={value} value={value}>{value === 'All' ? 'All rarities' : value}</option>)}</select><select aria-label="Ownership filter" className={inputClass} value={ownership} onChange={event => setOwnership(event.target.value)}>{(view === 'All Cards' ? ['All', 'Owned', 'Missing', 'Duplicates'] : ['All', 'Duplicates']).map(value => <option key={value} value={value}>{value === 'All' ? 'Any ownership' : value}</option>)}</select><select aria-label="Sort cards" className={inputClass} value={sort} onChange={event => setSort(event.target.value)}>{['Number', 'Name', 'Rarity'].map(value => <option key={value}> {value}</option>)}</select></div>
        <div className={view === 'Deck Builder' ? 'grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]' : ''}>
          <div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">{filtered.map(card => <CardTile key={card.id} card={card} quantity={count(viewedCards, card.id)} onInspect={() => inspect(card)} action={view === 'Deck Builder' ? <button type="button" className={`${buttonClass} w-full px-2 text-xs`} disabled={!canAdd(card.id)} onClick={() => void act('pack', { action: 'addToDeck', cardId: card.id }, `${card.name} added to your deck.`)}><Plus size={14} />{count(deck, card.id) ? `Add copy · ${count(deck, card.id)} in deck` : 'Add to deck'}</button> : undefined} />)}</div>{!filtered.length ? <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center"><h4 className="font-bold">{view === 'Players' && !target ? 'Choose a player to see their cards' : owned.length === 0 && view === 'My Cards' ? 'Your collection starts with a pack' : 'No cards match these filters'}</h4><p className="mt-2 text-sm text-slate-400">{owned.length === 0 && view === 'My Cards' ? 'Open a pack above, or explore All Cards to find your favourites.' : 'Try another search, rarity, or card type.'}</p></div> : null}</div>
          {view === 'Deck Builder' ? <aside className="rounded-2xl border border-amber-300/20 bg-slate-900/80 p-4 xl:sticky xl:top-24"><div className="flex items-center justify-between"><h4 className="font-bold text-amber-200">Your deck</h4><strong>{deck.length}/20</strong></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-amber-300" style={{ width: `${Math.min(100, deck.length * 5)}%` }} /></div><p className="mt-2 text-xs text-slate-400">{deck.length === 20 ? 'Full deck · ready to save' : `${20 - deck.length} slots remaining`}</p><div className="mt-4 space-y-2">{[...new Set(deck)].map(id => { const card = cardById.get(id); return card ? <div key={id} className="flex items-center gap-2 rounded-xl bg-slate-950/60 p-2"><button type="button" className="min-w-0 flex-1 text-left text-xs font-semibold" onClick={() => inspect(card)}>{card.name}<span className="ml-1 text-amber-200">×{count(deck, id)}</span></button><button type="button" aria-label={`Remove ${card.name} from deck`} className="rounded-lg p-2 hover:bg-white/10" disabled={busy} onClick={() => void act('pack', { action: 'removeFromDeck', cardId: id }, `${card.name} removed from your deck.`)}><Minus size={15} /></button></div> : null; })}{!deck.length ? <p className="py-5 text-center text-sm text-slate-500">Add cards from your collection to fill these slots.</p> : null}</div><label className="mt-5 block text-xs text-slate-300">Deck name<input aria-label="Deck name" maxLength={40} value={deckName} onChange={event => setDeckName(event.target.value)} className={`${inputClass} mt-1 w-full`} /></label><button type="button" className={`${primaryClass} mt-3 w-full`} disabled={busy || !deck.length || !deckName.trim()} onClick={() => void act('pack', { action: 'saveDeck', name: deckName, ...(editingDeckId ? { deckId: editingDeckId } : {}) }, 'Deck saved.')}>{editingDeckId ? 'Save deck changes' : 'Save deck'}</button>{editingDeckId ? <button type="button" className={`${buttonClass} mt-2 w-full`} disabled={busy || !deck.length || !deckName.trim()} onClick={() => void act('pack', { action: 'saveDeck', name: deckName }, 'Saved as a new deck.')}>Save as new deck</button> : null}<p className="mt-3 text-xs leading-relaxed text-slate-500">Adding and removing cards updates your current deck. Saving a named deck keeps it available below.</p><div className="mt-5 border-t border-white/10 pt-4"><h4 className="text-sm font-bold">Saved decks</h4>{!collection?.savedDecks.length ? <p className="mt-2 text-xs text-slate-500">Your named decks will appear here.</p> : collection.savedDecks.map(saved => <button key={saved.id} type="button" disabled={busy} onClick={() => { setEditingDeckId(saved.id); setDeckName(saved.name); void act('pack', { action: 'activateDeck', deckId: saved.id }, `${saved.name} loaded.`); }} className={`${buttonClass} mt-2 w-full justify-between text-left`}><span>{saved.name}<span className="mt-1 block text-xs font-normal text-slate-400">{saved.cardIds.length} cards · {saved.wins} wins / {saved.losses} losses</span></span><span className="text-xs text-amber-200">Load</span></button>)}</div></aside> : null}
        </div>
      </>}
    </div>}
    <Dialog open={Boolean(selectedCard)} onOpenChange={open => { if (!open) setInspected(null); }}><DialogContent className="max-h-[92dvh] w-[96vw] max-w-4xl sm:max-w-4xl overflow-y-auto border-amber-300/20 bg-[#101827] p-5 text-white sm:p-7">
      {selectedCard ? <><DialogTitle className="pr-6 text-2xl text-amber-200">{selectedCard.name}</DialogTitle><DialogDescription className="text-slate-400">#{String(selectedCard.id).padStart(3, '0')} · {selectedCard.rarity} · {selectedCard.type} · {selectedCard.family}</DialogDescription><div className="mt-3 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><div><a href={image(selectedCard.id)} target="_blank" rel="noopener noreferrer" aria-label={`Open full-size ${selectedCard.name}`}><img src={image(selectedCard.id)} alt={selectedCard.name} className="mx-auto max-h-[65vh] w-full rounded-2xl object-contain" /></a><p className="mt-3 text-center text-xs text-slate-400">Click the image for full-size art</p></div><div className="space-y-4"><div className="flex flex-wrap gap-2"><span className="rounded-lg bg-amber-300/15 px-3 py-2 text-sm text-amber-200">You own {count(owned, selectedCard.id)}</span><span className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-300">In your deck: {count(deck, selectedCard.id)}</span></div>{selectedCard.role ? <p className="text-sm"><span className="text-slate-400">Role: </span>{selectedCard.role}</p> : null}{selectedCard.type === 'Duck' ? <dl className="grid grid-cols-3 gap-2">{([['HP', selectedCard.hp], ['Attack', selectedCard.atk], ['Defence', selectedCard.def], ['Speed', selectedCard.spd], ['Special', selectedCard.spc]] as const).map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-slate-950/50 p-3"><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-1 text-xl font-bold">{value}</dd></div>)}</dl> : null}<section><h3 className="font-bold text-amber-200">{selectedCard.type === 'Duck' ? 'Abilities' : 'Equipment effect'}</h3>{selectedCard.structuredEffects.map((effect, index) => <div key={index} className="mt-2 rounded-xl border border-white/10 bg-slate-950/40 p-3"><p className="text-sm leading-relaxed">{effect.text}</p><p className="mt-2 text-xs text-slate-400">{effect.timing.replace(/([A-Z])/g, ' $1')} · {effect.cost ? `${effect.cost} special` : 'No special cost'}</p></div>)}</section>{selectedCard.flavor ? <p className="border-l-2 border-amber-300/30 pl-3 text-sm italic leading-relaxed text-slate-300">{selectedCard.flavor}</p> : null}<div className="flex flex-wrap gap-2"><button type="button" className={primaryClass} disabled={!canAdd(selectedCard.id)} onClick={() => void act('pack', { action: 'addToDeck', cardId: selectedCard.id }, `${selectedCard.name} added to your deck.`)}><Plus size={16} />Add to my deck</button><button type="button" className={buttonClass} disabled={!spare.some(card => card.cardId === selectedCard.id)} onClick={() => startTrade(selectedCard.id)}><ArrowLeftRight size={16} />Offer this card</button></div>{!count(owned, selectedCard.id) ? <p className="text-xs text-slate-400">Collect this card in packs or trade with a player who has a spare copy.</p> : null}</div></div></> : null}
    </DialogContent></Dialog>
  </div>;
}
