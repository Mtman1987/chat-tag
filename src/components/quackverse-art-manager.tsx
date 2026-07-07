'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
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
};

function cardStatus(entry?: QuackverseArtEntry | null) {
  const staticReady = Boolean(entry?.static);
  const hoverReady = Boolean(entry?.hover);
  if (staticReady && hoverReady) return 'static + hover';
  if (staticReady) return 'static';
  if (hoverReady) return 'hover';
  return 'empty';
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
      >
        {src ? (
          <Image src={src} alt={card.name} width={1280} height={800} unoptimized className="aspect-[16/10] w-full object-cover" />
        ) : (
          <div className="flex aspect-[16/10] items-center justify-center text-sm text-slate-400">
            No art uploaded yet
          </div>
        )}
      </div>
      <div className="grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-2">
          <div className="mb-1 font-semibold text-white">Static image</div>
          {entry?.static ? (
            <Image src={entry.static.url} alt={`${card.name} static`} width={512} height={288} unoptimized className="h-36 w-full rounded-md object-cover" />
          ) : (
            <div className="flex h-36 items-center justify-center rounded-md border border-dashed border-white/10 text-slate-500">
              Not set
            </div>
          )}
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-2">
          <div className="mb-1 font-semibold text-white">Hover art</div>
          {entry?.hover ? (
            <Image src={entry.hover.url} alt={`${card.name} hover`} width={512} height={288} unoptimized className="h-36 w-full rounded-md object-cover" />
          ) : (
            <div className="flex h-36 items-center justify-center rounded-md border border-dashed border-white/10 text-slate-500">
              Not set
            </div>
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
  const [loading, setLoading] = useState(false);
  const [generationMessage, setGenerationMessage] = useState('');

  const selectedCard = useMemo(
    () => quackverseCards.find((card) => card.id === selectedCardId) || quackverseCards[0],
    [selectedCardId],
  );

  const filteredCards = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return quackverseCards.filter((card) => {
      if (!needle) return true;
      return [card.name, card.role || '', card.type, String(card.id)]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [query]);

  const refresh = useCallback(async () => {
    const response = await fetch('/api/quackverse/art', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load art manifest (${response.status})`);
    const data = (await response.json()) as QuackverseArtResponse;
    setManifest(data.cards || {});
  }, []);

  useEffect(() => {
    refresh().catch((error) => console.error('[QuackverseArtManager] refresh failed:', error));
  }, [refresh]);

  const uploadAsset = useCallback(
    async (variant: 'static' | 'hover', file: File | null) => {
      if (!file || !selectedCard) return;
      setLoading(true);
      try {
        const formData = new FormData();
        formData.set('cardId', String(selectedCard.id));
        formData.set('variant', variant);
        formData.set('file', file);
        const response = await fetch('/api/quackverse/art', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: formData,
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error || `Upload failed (${response.status})`);
        }
        await refresh();
      } finally {
        setLoading(false);
      }
    },
    [refresh, selectedCard],
  );

  const generateAsset = useCallback(
    async (variant: 'static' | 'hover', cardIds: number[]) => {
      if (!cardIds.length) return;
      setLoading(true);
      setGenerationMessage(`Generating ${variant} art for ${cardIds.length} card${cardIds.length === 1 ? '' : 's'}...`);
      try {
        const response = await fetch('/api/quackverse/art/generate', {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            variant,
            cardIds,
            limit: cardIds.length,
            missingOnly: false,
          }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error || `Generation failed (${response.status})`);
        }
        const successCount = Array.isArray(data?.results)
          ? data.results.filter((item: any) => item?.success).length
          : 0;
        const failedCount = Math.max(0, Number(data?.count || 0) - successCount);
        setGenerationMessage(`Generated ${successCount} ${variant} asset${successCount === 1 ? '' : 's'}${failedCount ? `, ${failedCount} failed` : ''}.`);
        await refresh();
      } catch (error: any) {
        setGenerationMessage(error?.message || 'Generation failed');
      } finally {
        setLoading(false);
      }
    },
    [refresh],
  );

  const selectedEntry = manifest[String(selectedCard.id)] || null;

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-headline text-lg text-white">Card Art Manager</h3>
          <p className="text-sm text-slate-400">Upload static art and hover GIFs for any Quackverse card.</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => refresh().catch(() => {})}>
          Refresh
        </Button>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search 100 cards..."
            className="h-9 bg-slate-950"
          />
          <ScrollArea className="mt-3 h-[36rem] pr-3">
            <div className="space-y-2">
              {filteredCards.map((card) => {
                const entry = manifest[String(card.id)];
                const active = card.id === selectedCardId;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setSelectedCardId(card.id)}
                    className={cn(
                      'w-full rounded-md border p-2 text-left transition',
                      active ? 'border-cyan-300 bg-cyan-300/10' : 'border-white/10 bg-white/[0.04] hover:border-cyan-300/60',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[0.68rem] text-slate-400">#{card.id} {card.type}</div>
                        <div className="truncate font-semibold text-white">{card.name}</div>
                        <div className="truncate text-xs text-slate-400">{card.role || card.effect || 'No role'}</div>
                      </div>
                      <Badge variant="outline" className="rounded-md border-white/15 text-[0.62rem] text-slate-200">
                        {cardStatus(entry)}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-normal text-slate-400">Selected card</div>
              <h4 className="font-headline text-xl text-white">{selectedCard.name}</h4>
              <p className="text-sm text-slate-400">#{selectedCard.id} · {selectedCard.role || selectedCard.type}</p>
            </div>
            <Badge variant="outline" className="rounded-md border-cyan-300/50 text-cyan-100">
              {cardStatus(selectedEntry)}
            </Badge>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <AssetPreview card={selectedCard} entry={selectedEntry} />

              <div className="space-y-4 rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="space-y-2 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3">
                <div className="text-sm font-semibold text-white">Generate with StreamWeaver SeaArt</div>
                <div className="grid gap-2">
                  <Button
                    type="button"
                    disabled={loading}
                    onClick={() => void generateAsset('static', [selectedCard.id])}
                    className="justify-start"
                  >
                    Generate Static Art
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={loading}
                    onClick={() => void generateAsset('hover', [selectedCard.id])}
                    className="justify-start"
                  >
                    Generate Hover Still
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={loading}
                    onClick={() => {
                      const missing = quackverseCards
                        .filter((card) => !manifest[String(card.id)]?.static)
                        .slice(0, 5)
                        .map((card) => card.id);
                      void generateAsset('static', missing);
                    }}
                    className="justify-start"
                  >
                    Fill Next 5 Missing
                  </Button>
                </div>
                {generationMessage && <div className="text-xs text-cyan-100">{generationMessage}</div>}
                <div className="text-xs text-slate-400">
                  Hover stills are saved in the hover slot now; true GIF/video hover generation can be swapped in once StreamWeaver exposes a video generation route.
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-semibold text-white">Static image</div>
                <input
                  type="file"
                  accept="image/*"
                  disabled={loading}
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    void uploadAsset('static', file);
                    event.target.value = '';
                  }}
                  className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-cyan-300/20 file:px-3 file:py-2 file:text-cyan-50 hover:file:bg-cyan-300/30"
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-semibold text-white">Hover GIF</div>
                <input
                  type="file"
                  accept="image/gif,video/mp4,video/webm,image/*"
                  disabled={loading}
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    void uploadAsset('hover', file);
                    event.target.value = '';
                  }}
                  className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-fuchsia-300/20 file:px-3 file:py-2 file:text-fuchsia-50 hover:file:bg-fuchsia-300/30"
                />
              </div>

              <div className="rounded-md border border-white/10 bg-white/[0.04] p-3 text-xs text-slate-300">
                Hover the large preview to verify the GIF swap. Static art stays in place when the pointer leaves.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
