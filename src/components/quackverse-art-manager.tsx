'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { getAuthHeaders } from '@/lib/client-auth';
import { quackverseCards, type QuackverseCard } from '@/lib/quackverse-data';

type QuackverseArtAsset = {
  fileName: string;
  mimeType: string;
  originalName: string;
  updatedAt: string;
  url: string;
};

type QuackverseArtEntry = {
  static?: QuackverseArtAsset | null;
  hover?: QuackverseArtAsset | null;
};

type QuackverseArtResponse = {
  cards?: Record<string, QuackverseArtEntry>;
  staticCount?: number;
  hoverCount?: number;
  cardCount?: number;
};

const IMAGE_PROVIDERS = [
  { value: 'seaart', label: 'SeaArt' },
  { value: 'eden', label: 'Eden / Leonardo' },
  { value: 'cloudflare', label: 'Cloudflare FLUX' },
  { value: 'pollinations', label: 'Pollinations' },
  { value: 'perchance', label: 'Perchance' },
] as const;

const IMAGE_RESOLUTIONS = [
  { value: '2048x1280', label: '2048 × 1280 — preferred' },
  { value: '1536x960', label: '1536 × 960 — fallback' },
  { value: '1024x640', label: '1024 × 640 — fast' },
] as const;

type QuackverseImageProvider = (typeof IMAGE_PROVIDERS)[number]['value'];

type BatchProgress = {
  active: boolean;
  completed: number;
  total: number;
  currentCardId?: number;
  currentCardName?: string;
};

function cardStatus(entry?: QuackverseArtEntry | null) {
  const staticReady = Boolean(entry?.static);
  const hoverReady = Boolean(entry?.hover);
  if (staticReady && hoverReady) return 'ready';
  if (staticReady) return 'needs animation';
  if (hoverReady) return 'needs static';
  return 'missing';
}

function AssetPreview({ card, entry }: { card: QuackverseCard; entry?: QuackverseArtEntry | null }) {
  const [hovered, setHovered] = useState(false);
  const staticUrl = entry?.static?.url || card.artUrl || '';
  const hoverUrl = entry?.hover?.url || card.artHoverUrl || staticUrl;
  const src = hovered ? hoverUrl : staticUrl;

  return (
    <div className="space-y-3">
      <div
        className="overflow-hidden rounded-lg border border-white/10 bg-slate-950"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onTouchStart={() => setHovered(true)}
        onTouchEnd={() => window.setTimeout(() => setHovered(false), 4000)}
      >
        {src ? (
          <Image src={src} alt={card.name} width={1280} height={800} unoptimized className="aspect-[16/10] w-full object-cover" />
        ) : (
          <div className="flex aspect-[16/10] items-center justify-center text-sm text-slate-400">No saved art yet</div>
        )}
      </div>
      <div className="grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-2">
          <div className="mb-1 font-semibold text-white">Static master</div>
          {entry?.static ? (
            <Image src={entry.static.url} alt={`${card.name} static`} width={512} height={320} unoptimized className="h-36 w-full rounded-md object-cover" />
          ) : (
            <div className="flex h-36 items-center justify-center rounded-md border border-dashed border-white/10 text-slate-500">Missing</div>
          )}
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-2">
          <div className="mb-1 font-semibold text-white">Triggered animation</div>
          {entry?.hover ? (
            <Image src={entry.hover.url} alt={`${card.name} animation`} width={512} height={320} unoptimized className="h-36 w-full rounded-md object-cover" />
          ) : (
            <div className="flex h-36 items-center justify-center rounded-md border border-dashed border-white/10 text-slate-500">Missing</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function QuackverseArtManager() {
  const [query, setQuery] = useState('');
  const [selectedCardId, setSelectedCardId] = useState<number>(quackverseCards[0]?.id ?? 1);
  const [manifest, setManifest] = useState<Record<string, QuackverseArtEntry>>({});
  const [providerOverride, setProviderOverride] = useState<QuackverseImageProvider>('seaart');
  const [resolution, setResolution] = useState('2048x1280');
  const [rangeStart, setRangeStart] = useState(String(quackverseCards[0]?.id ?? 1));
  const [rangeCount, setRangeCount] = useState('5');
  const [message, setMessage] = useState('');
  const [batch, setBatch] = useState<BatchProgress>({ active: false, completed: 0, total: 0 });
  const stopRequestedRef = useRef(false);

  const selectedCard = useMemo(
    () => quackverseCards.find((card) => card.id === selectedCardId) || quackverseCards[0],
    [selectedCardId],
  );

  const filteredCards = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return quackverseCards.filter((card) => {
      if (!needle) return true;
      return [card.name, card.role || '', card.type, String(card.id)].join(' ').toLowerCase().includes(needle);
    });
  }, [query]);

  const readyCount = useMemo(
    () => quackverseCards.filter((card) => manifest[String(card.id)]?.static && manifest[String(card.id)]?.hover).length,
    [manifest],
  );

  const refresh = useCallback(async () => {
    const response = await fetch('/api/quackverse/art', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load art manifest (${response.status})`);
    const data = (await response.json()) as QuackverseArtResponse;
    setManifest(data.cards || {});
  }, []);

  useEffect(() => {
    refresh().catch((error) => setMessage(error?.message || 'Could not load Quackverse art.'));
  }, [refresh]);

  const requestJson = useCallback(async (url: string, init: RequestInit, label: string) => {
    const response = await fetch(url, init);
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `${label} failed (${response.status})`);
    return data;
  }, []);

  const deleteCardArt = useCallback(async (cardId: number) => {
    await requestJson('/api/quackverse/art', {
      method: 'DELETE',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ cardId, variant: 'all' }),
    }, `Delete card #${cardId}`);
  }, [requestJson]);

  const generateStatic = useCallback(async (cardId: number) => {
    const data = await requestJson('/api/quackverse/art/generate', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        variant: 'static',
        cardIds: [cardId],
        limit: 1,
        missingOnly: false,
        providerOverride,
        resolution,
        useReferences: false,
      }),
    }, `Generate card #${cardId}`);
    const result = Array.isArray(data?.results) ? data.results[0] : null;
    if (!result?.success) throw new Error(result?.error || `Card #${cardId} generation did not complete.`);
    return result;
  }, [providerOverride, requestJson, resolution]);

  const animateCard = useCallback(async (cardId: number) => {
    const data = await requestJson('/api/quackverse/art/enhance-animate', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ cardId }),
    }, `Animate card #${cardId}`);
    if (!data?.success) throw new Error(data?.error || `Card #${cardId} animation did not complete.`);
    return data;
  }, [requestJson]);

  const rebuildCard = useCallback(async (cardId: number, replaceExisting: boolean) => {
    const card = quackverseCards.find((item) => item.id === cardId);
    if (!card) throw new Error(`Unknown Quackverse card #${cardId}.`);
    const current = manifest[String(cardId)] || {};

    if (replaceExisting) {
      setMessage(`#${cardId} ${card.name}: clearing old art...`);
      await deleteCardArt(cardId);
    }

    if (replaceExisting || !current.static) {
      setMessage(`#${cardId} ${card.name}: generating ${resolution} static art...`);
      await generateStatic(cardId);
    }

    if (replaceExisting || !current.hover || !current.static) {
      setMessage(`#${cardId} ${card.name}: building triggered animation...`);
      await animateCard(cardId);
    }

    await refresh();
    setMessage(`#${cardId} ${card.name}: generated, animated, saved, and verified.`);
  }, [animateCard, deleteCardArt, generateStatic, manifest, refresh, resolution]);

  const runBatch = useCallback(async (ids: number[], options: { replaceExisting: boolean; clearAllFirst?: boolean }) => {
    if (!ids.length) {
      setMessage('Nothing to generate.');
      return;
    }

    stopRequestedRef.current = false;
    setBatch({ active: true, completed: 0, total: ids.length });

    try {
      if (options.clearAllFirst) {
        setMessage(`Clearing all ${ids.length} selected cards before rebuild...`);
        for (let index = 0; index < ids.length; index += 1) {
          if (stopRequestedRef.current) throw new Error('Stopped by admin.');
          await deleteCardArt(ids[index]);
          setBatch({ active: true, completed: 0, total: ids.length, currentCardId: ids[index], currentCardName: 'clearing old art' });
        }
        setManifest({});
      }

      for (let index = 0; index < ids.length; index += 1) {
        if (stopRequestedRef.current) throw new Error('Stopped by admin.');
        const cardId = ids[index];
        const card = quackverseCards.find((item) => item.id === cardId);
        setBatch({
          active: true,
          completed: index,
          total: ids.length,
          currentCardId: cardId,
          currentCardName: card?.name || `Card ${cardId}`,
        });
        await rebuildCard(cardId, options.replaceExisting && !options.clearAllFirst);
        setBatch({
          active: true,
          completed: index + 1,
          total: ids.length,
          currentCardId: cardId,
          currentCardName: card?.name || `Card ${cardId}`,
        });
      }
      setMessage(`Finished ${ids.length} card${ids.length === 1 ? '' : 's'}.`);
    } catch (error: any) {
      setMessage(error?.message || 'Batch stopped with an error.');
    } finally {
      setBatch((current) => ({ ...current, active: false }));
      await refresh().catch(() => {});
    }
  }, [deleteCardArt, rebuildCard, refresh]);

  const runSelected = useCallback(() => {
    void runBatch([selectedCard.id], { replaceExisting: true });
  }, [runBatch, selectedCard.id]);

  const runNextMissing = useCallback(() => {
    const next = quackverseCards.find((card) => {
      const entry = manifest[String(card.id)];
      return !entry?.static || !entry?.hover;
    });
    if (!next) {
      setMessage('Every Quackverse card already has static art and triggered animation.');
      return;
    }
    setSelectedCardId(next.id);
    void runBatch([next.id], { replaceExisting: false });
  }, [manifest, runBatch]);

  const runRange = useCallback(() => {
    const start = Math.max(1, Number(rangeStart) || 1);
    const count = Math.max(1, Math.min(25, Number(rangeCount) || 1));
    const ids = quackverseCards.filter((card) => card.id >= start).slice(0, count).map((card) => card.id);
    if (!ids.length) {
      setMessage('No cards match that range.');
      return;
    }
    if (!window.confirm(`Rebuild ${ids.length} card${ids.length === 1 ? '' : 's'} starting at #${ids[0]}? Existing art for those cards will be replaced.`)) return;
    void runBatch(ids, { replaceExisting: true });
  }, [rangeCount, rangeStart, runBatch]);

  const runAll = useCallback(() => {
    if (!window.confirm('Rebuild ALL Quackverse art? This deletes every saved static and animated asset first, then generates each card one at a time. Keep this page open until it finishes.')) return;
    void runBatch(quackverseCards.map((card) => card.id), { replaceExisting: false, clearAllFirst: true });
  }, [runBatch]);

  const selectedEntry = manifest[String(selectedCard.id)] || null;

  return (
    <section data-quackverse-art-manager className="relative z-[60] isolate rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-headline text-lg text-white">Quackverse Art Rebuilder</h3>
          <p className="text-sm text-slate-400">One card at a time: generate a full-size static master, build its triggered GIF, save both to the live volume, then verify.</p>
          <p className="mt-1 text-xs text-cyan-100">{readyCount}/{quackverseCards.length} cards have both static + animation.</p>
        </div>
        <Button type="button" variant="secondary" disabled={batch.active} onClick={() => void refresh()}>
          Refresh Status
        </Button>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search cards..." className="h-9 bg-slate-950" />
          <ScrollArea className="mt-3 h-[36rem] pr-3">
            <div className="space-y-2">
              {filteredCards.map((card) => {
                const entry = manifest[String(card.id)];
                const active = card.id === selectedCardId;
                return (
                  <button
                    key={card.id}
                    type="button"
                    disabled={batch.active}
                    onClick={() => setSelectedCardId(card.id)}
                    className={cn(
                      'w-full rounded-md border p-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
                      active ? 'border-cyan-300 bg-cyan-300/10' : 'border-white/10 bg-white/[0.04] hover:border-cyan-300/60',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[0.68rem] text-slate-400">#{card.id} {card.type}</div>
                        <div className="truncate font-semibold text-white">{card.name}</div>
                      </div>
                      <Badge variant="outline" className="rounded-md border-white/15 text-[0.62rem] text-slate-200">{cardStatus(entry)}</Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-normal text-slate-400">Selected card</div>
              <h4 className="font-headline text-xl text-white">{selectedCard.name}</h4>
              <p className="text-sm text-slate-400">#{selectedCard.id} · {selectedCard.role || selectedCard.type}</p>
            </div>
            <Badge variant="outline" className="rounded-md border-cyan-300/50 text-cyan-100">{cardStatus(selectedEntry)}</Badge>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <AssetPreview card={selectedCard} entry={selectedEntry} />

            <div data-quackverse-art-actions className="space-y-4 rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="space-y-3 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3">
                <div>
                  <div className="text-sm font-semibold text-white">Generation Settings</div>
                  <div className="text-xs text-slate-300">Balanced masculine/feminine character presentation is assigned automatically across Duck cards. Equipment stays non-gendered.</div>
                </div>
                <Select value={providerOverride} disabled={batch.active} onValueChange={(value) => setProviderOverride(value as QuackverseImageProvider)}>
                  <SelectTrigger className="h-9 border-white/10 bg-slate-950 text-white"><SelectValue placeholder="Provider" /></SelectTrigger>
                  <SelectContent>
                    {IMAGE_PROVIDERS.map((provider) => <SelectItem key={provider.value} value={provider.value}>{provider.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={resolution} disabled={batch.active} onValueChange={setResolution}>
                  <SelectTrigger className="h-9 border-white/10 bg-slate-950 text-white"><SelectValue placeholder="Resolution" /></SelectTrigger>
                  <SelectContent>
                    {IMAGE_RESOLUTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Button type="button" className="w-full" disabled={batch.active} onClick={runSelected}>
                  Generate + Animate Selected Card
                </Button>
                <Button type="button" variant="secondary" className="w-full" disabled={batch.active} onClick={runNextMissing}>
                  Generate Next Missing Card
                </Button>
              </div>

              <div className="space-y-2 rounded-md border border-white/10 bg-white/[0.04] p-3">
                <div className="text-sm font-semibold text-white">Range</div>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={rangeStart} disabled={batch.active} onChange={(event) => setRangeStart(event.target.value)} inputMode="numeric" placeholder="Start ID" className="h-9 bg-slate-950" />
                  <Input value={rangeCount} disabled={batch.active} onChange={(event) => setRangeCount(event.target.value)} inputMode="numeric" placeholder="Count" className="h-9 bg-slate-950" />
                </div>
                <Button type="button" variant="secondary" className="w-full" disabled={batch.active} onClick={runRange}>Rebuild Range</Button>
              </div>

              <Button type="button" variant="secondary" className="w-full bg-red-950/70 text-red-50 hover:bg-red-900/80" disabled={batch.active} onClick={runAll}>
                Rebuild All Cards
              </Button>

              {batch.active && (
                <div className="space-y-2 rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-xs text-amber-50">
                  <div className="font-semibold">{batch.completed}/{batch.total} complete</div>
                  <div>{batch.currentCardId ? `Working on #${batch.currentCardId} ${batch.currentCardName || ''}` : 'Preparing batch...'}</div>
                  <Button type="button" variant="secondary" className="w-full" onClick={() => { stopRequestedRef.current = true; setMessage('Stop requested. The current card will finish first.'); }}>
                    Stop After Current Card
                  </Button>
                </div>
              )}

              {message && <div className="rounded-md border border-white/10 bg-slate-950 p-3 text-xs text-cyan-100">{message}</div>}

              <div className="rounded-md border border-white/10 bg-white/[0.04] p-3 text-xs text-slate-300">
                Selected/range rebuilds replace those cards. “Rebuild All Cards” clears every old static + GIF first. Keep this page open during a batch; each card is verified before the next begins.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
