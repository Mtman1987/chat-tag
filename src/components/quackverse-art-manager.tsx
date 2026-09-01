'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getAuthHeaders } from '@/lib/client-auth';
import { quackverseCards } from '@/lib/quackverse-data';

type ArtAsset = { url: string; fileName: string; updatedAt: string };
type ArtEntry = { static?: ArtAsset | null; hover?: ArtAsset | null };
type ManifestResponse = { cards?: Record<string, ArtEntry> };

type ProviderKey = 'eden' | 'cloudflare' | 'seaart';
type ModelOption = { value: string; label: string; hint?: string };

const providers: Array<{ value: ProviderKey; label: string }> = [
  { value: 'eden', label: 'Eden AI' },
  { value: 'cloudflare', label: 'Cloudflare Workers AI' },
  { value: 'seaart', label: 'SeaArt' },
];

const providerModels: Record<ProviderKey, ModelOption[]> = {
  eden: [
    { value: 'image/generation/bytedance', label: 'ByteDance Image', hint: 'Recommended for prompt adherence' },
    { value: 'image/generation/openai/dall-e-3', label: 'OpenAI DALL-E 3', hint: 'Strong natural-language following' },
    { value: 'image/generation/stabilityai/stable-diffusion-xl-1024-v1-0', label: 'Stability AI SDXL', hint: 'General illustration' },
    { value: 'image/generation/leonardo/SDXL 0.9', label: 'Leonardo SDXL 0.9', hint: 'Legacy reliable default' },
    { value: '__custom__', label: 'Custom Eden model ID', hint: 'Use any model ID available to your Eden account' },
  ],
  cloudflare: [
    { value: '@cf/leonardo/phoenix-1.0', label: 'Leonardo Phoenix 1.0', hint: 'Best Cloudflare prompt adherence' },
    { value: '@cf/leonardo/lucid-origin', label: 'Leonardo Lucid Origin', hint: 'Polished illustration' },
    { value: '@cf/black-forest-labs/flux-2-klein-4b', label: 'FLUX.2 Klein 4B', hint: 'Fast and reference-friendly' },
    { value: '@cf/black-forest-labs/flux-1-schnell', label: 'FLUX.1 Schnell', hint: 'Fast draft model' },
  ],
  seaart: [
    { value: 'seaart-infinity', label: 'SeaArt Infinity', hint: 'High-detail general model' },
    { value: 'seaart-film', label: 'SeaArt Film', hint: 'Cinematic style' },
    { value: 'wai-ani-ponyxl', label: 'WAI-ANI PonyXL', hint: 'Stylized/anime' },
    { value: 'seaart-realistic', label: 'SeaArt Realistic', hint: 'Realistic profile' },
  ],
};

const providerDefaults: Record<ProviderKey, string> = {
  eden: 'image/generation/bytedance',
  cloudflare: '@cf/leonardo/phoenix-1.0',
  seaart: 'seaart-infinity',
};

const resolutions = ['2048x1280', '1536x960', '1024x640'] as const;

function status(entry?: ArtEntry) {
  if (entry?.static && entry?.hover) return 'ready';
  if (entry?.static) return 'needs animation';
  return 'missing';
}

export function QuackverseArtManager() {
  const [manifest, setManifest] = useState<Record<string, ArtEntry>>({});
  const [selectedId, setSelectedId] = useState(String(quackverseCards[0]?.id ?? 1));
  const [provider, setProvider] = useState<ProviderKey>('eden');
  const [model, setModel] = useState(providerDefaults.eden);
  const [customModel, setCustomModel] = useState('');
  const [resolution, setResolution] = useState('2048x1280');
  const [rangeStart, setRangeStart] = useState('1');
  const [rangeCount, setRangeCount] = useState('5');
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState('');
  const [message, setMessage] = useState('');
  const stopRef = useRef(false);

  const selected = useMemo(
    () => quackverseCards.find((card) => card.id === Number(selectedId)) || quackverseCards[0],
    [selectedId],
  );
  const selectedEntry = manifest[String(selected.id)] || {};
  const ready = useMemo(
    () => quackverseCards.filter((card) => manifest[String(card.id)]?.static && manifest[String(card.id)]?.hover).length,
    [manifest],
  );
  const modelOptions = providerModels[provider];
  const activeModel = model === '__custom__' ? customModel.trim() : model;
  const activeModelLabel = modelOptions.find((item) => item.value === model)?.label || activeModel || 'Default model';

  const refresh = useCallback(async () => {
    const response = await fetch('/api/quackverse/art', { cache: 'no-store' });
    const data = await response.json().catch(() => null) as ManifestResponse | null;
    if (!response.ok) throw new Error((data as any)?.error || `Refresh failed (${response.status})`);
    setManifest(data?.cards || {});
  }, []);

  useEffect(() => { void refresh().catch((error) => setMessage(error.message)); }, [refresh]);

  const changeProvider = useCallback((value: string) => {
    const next = value as ProviderKey;
    setProvider(next);
    setModel(providerDefaults[next]);
    setCustomModel('');
    setMessage('');
  }, []);

  const request = useCallback(async (url: string, method: string, body: unknown) => {
    const response = await fetch(url, {
      method,
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `${method} ${url} failed (${response.status})`);
    return data;
  }, []);

  const rebuildOne = useCallback(async (cardId: number, replace = true) => {
    const card = quackverseCards.find((item) => item.id === cardId);
    if (!card) throw new Error(`Unknown card #${cardId}`);
    if (!activeModel) throw new Error('Choose an image model before generating.');
    const current = manifest[String(cardId)] || {};

    if (replace) {
      setMessage(`#${cardId} ${card.name}: removing old static + animation...`);
      await request('/api/quackverse/art', 'DELETE', { cardId, variant: 'all' });
    }

    if (replace || !current.static) {
      setMessage(`#${cardId} ${card.name}: generating ${resolution} with ${activeModelLabel}...`);
      const generated = await request('/api/quackverse/art/generate', 'POST', {
        variant: 'static', cardIds: [cardId], limit: 1, missingOnly: false,
        providerOverride: provider, model: activeModel, resolution, useReferences: false,
      });
      const result = generated?.results?.[0];
      if (!result?.success) throw new Error(result?.error || `Card #${cardId} generation failed`);
    }

    if (replace || !current.hover || !current.static) {
      setMessage(`#${cardId} ${card.name}: building triggered animation...`);
      const animated = await request('/api/quackverse/art/enhance-animate', 'POST', { cardId });
      if (!animated?.success) throw new Error(animated?.error || `Card #${cardId} animation failed`);
    }

    await refresh();
    setMessage(`#${cardId} ${card.name}: generated, animated, saved, verified.`);
  }, [activeModel, activeModelLabel, manifest, provider, refresh, request, resolution]);

  const run = useCallback(async (ids: number[], replace = true) => {
    if (!ids.length || working) return;
    if (!activeModel) {
      setMessage('Choose an image model before generating.');
      return;
    }
    setWorking(true);
    stopRef.current = false;
    try {
      for (let index = 0; index < ids.length; index += 1) {
        if (stopRef.current) throw new Error('Stopped by admin.');
        const card = quackverseCards.find((item) => item.id === ids[index]);
        setProgress(`${index + 1}/${ids.length} · #${ids[index]} ${card?.name || ''}`);
        await rebuildOne(ids[index], replace);
      }
      setProgress(`${ids.length}/${ids.length} complete`);
    } catch (error: any) {
      setMessage(error?.message || 'Rebuild failed');
    } finally {
      setWorking(false);
      await refresh().catch(() => {});
    }
  }, [activeModel, rebuildOne, refresh, working]);

  const nextMissing = useCallback(() => {
    const next = quackverseCards.find((card) => {
      const entry = manifest[String(card.id)];
      return !entry?.static || !entry?.hover;
    });
    if (!next) return setMessage('Every card is ready.');
    setSelectedId(String(next.id));
    void run([next.id], false);
  }, [manifest, run]);

  const runRange = useCallback(() => {
    const start = Math.max(1, Number(rangeStart) || 1);
    const count = Math.max(1, Math.min(25, Number(rangeCount) || 1));
    const ids = quackverseCards.filter((card) => card.id >= start).slice(0, count).map((card) => card.id);
    if (!ids.length) return setMessage('No cards match that range.');
    if (window.confirm(`Rebuild ${ids.length} cards starting at #${ids[0]}?`)) void run(ids, true);
  }, [rangeCount, rangeStart, run]);

  const runAll = useCallback(() => {
    if (!window.confirm('Rebuild ALL Quackverse cards? Every existing static + animation will be replaced one card at a time. Keep this page open.')) return;
    void run(quackverseCards.map((card) => card.id), true);
  }, [run]);

  const previewUrl = selectedEntry.static?.url || selected.artUrl || '';

  return (
    <section data-quackverse-art-manager className="relative z-[60] isolate rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-headline text-lg text-white">Quackverse Art Rebuilder</h3>
          <p className="text-sm text-slate-400">Generate one full-size card, animate that same static master, save both to the live volume, then verify.</p>
          <p className="mt-1 text-xs text-cyan-100">{ready}/{quackverseCards.length} ready</p>
        </div>
        <Button type="button" variant="secondary" disabled={working} onClick={() => void refresh()}>Refresh Status</Button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          <Select value={selectedId} disabled={working} onValueChange={setSelectedId}>
            <SelectTrigger className="bg-slate-950 text-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {quackverseCards.map((card) => (
                <SelectItem key={card.id} value={String(card.id)}>#{card.id} · {card.name} · {status(manifest[String(card.id)])}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-headline text-xl text-white">{selected.name}</div>
              <div className="text-sm text-slate-400">#{selected.id} · {selected.role || selected.type}</div>
            </div>
            <Badge variant="outline">{status(selectedEntry)}</Badge>
          </div>
          {previewUrl ? (
            <Image src={previewUrl} alt={selected.name} width={1280} height={800} unoptimized className="aspect-[16/10] w-full rounded-lg border border-white/10 object-cover" />
          ) : (
            <div className="flex aspect-[16/10] items-center justify-center rounded-lg border border-dashed border-white/10 text-slate-500">No saved art</div>
          )}
        </div>

        <div data-quackverse-art-actions className="space-y-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="text-sm font-semibold text-white">Generation Settings</div>
          <Select value={provider} disabled={working} onValueChange={changeProvider}>
            <SelectTrigger className="bg-slate-950 text-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {providers.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={model} disabled={working} onValueChange={setModel}>
            <SelectTrigger className="bg-slate-950 text-white"><SelectValue placeholder="Choose model" /></SelectTrigger>
            <SelectContent>
              {modelOptions.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}{item.hint ? ` · ${item.hint}` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {provider === 'eden' && model === '__custom__' && (
            <Input
              value={customModel}
              disabled={working}
              onChange={(event) => setCustomModel(event.target.value)}
              placeholder="image/generation/provider/model-id"
              className="bg-slate-950 text-white"
            />
          )}

          <Select value={resolution} disabled={working} onValueChange={setResolution}>
            <SelectTrigger className="bg-slate-950 text-white"><SelectValue /></SelectTrigger>
            <SelectContent>{resolutions.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
          </Select>

          <div className="rounded-md border border-white/10 bg-black/20 p-2 text-xs text-slate-300">
            Using <span className="font-semibold text-white">{activeModelLabel}</span>. Eden now exposes several useful choices plus a custom model ID so you are not locked to one model.
          </div>

          <Button type="button" className="w-full" disabled={working || !activeModel} onClick={() => void run([selected.id], true)}>Generate + Animate Selected Card</Button>
          <Button type="button" variant="secondary" className="w-full" disabled={working || !activeModel} onClick={nextMissing}>Generate Next Missing Card</Button>

          <div className="rounded-md border border-white/10 p-3">
            <div className="mb-2 text-sm font-semibold text-white">Range</div>
            <div className="grid grid-cols-2 gap-2">
              <Input value={rangeStart} disabled={working} onChange={(event) => setRangeStart(event.target.value)} inputMode="numeric" placeholder="Start ID" />
              <Input value={rangeCount} disabled={working} onChange={(event) => setRangeCount(event.target.value)} inputMode="numeric" placeholder="Count" />
            </div>
            <Button type="button" variant="secondary" className="mt-2 w-full" disabled={working || !activeModel} onClick={runRange}>Rebuild Range</Button>
          </div>

          <Button type="button" variant="secondary" className="w-full bg-red-950/70 text-red-50 hover:bg-red-900/80" disabled={working || !activeModel} onClick={runAll}>Rebuild All Cards</Button>

          {working && <Button type="button" variant="outline" className="w-full" onClick={() => { stopRef.current = true; setMessage('Stop requested; current card will finish first.'); }}>Stop After Current Card</Button>}
          {progress && <div className="text-xs text-amber-100">{progress}</div>}
          {message && <div className="rounded-md border border-white/10 bg-slate-950 p-2 text-xs text-cyan-100">{message}</div>}
          <div className="text-xs text-slate-400">Pollinations and Perchance are hidden from this Quackverse tool because they were not producing dependable card art. Duck cards alternate feminine/masculine presentation automatically; equipment stays non-gendered.</div>
        </div>
      </div>
    </section>
  );
}
