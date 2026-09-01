'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { getAuthHeaders } from '@/lib/client-auth';

type ArtEntry = { static?: unknown; hover?: unknown };
type ArtManifestResponse = { cards?: Record<string, ArtEntry> };

export function QuackverseArtEnhanceAnimate() {
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState('');

  const run = async () => {
    setWorking(true);
    setStatus('Loading imported Quackverse art...');
    try {
      const manifestResponse = await fetch('/api/quackverse/art', { cache: 'no-store' });
      const manifest = (await manifestResponse.json().catch(() => null)) as ArtManifestResponse | null;
      if (!manifestResponse.ok) throw new Error(`Could not load card art (${manifestResponse.status})`);

      const cardIds = Object.entries(manifest?.cards || {})
        .filter(([, entry]) => Boolean(entry?.static))
        .map(([cardId]) => Number(cardId))
        .filter((cardId) => Number.isFinite(cardId))
        .sort((a, b) => a - b);

      if (!cardIds.length) throw new Error('No imported static card art is available yet.');

      let successCount = 0;
      const failures: string[] = [];
      for (let index = 0; index < cardIds.length; index += 1) {
        const cardId = cardIds[index];
        setStatus(`Enhancing + animating ${index + 1} / ${cardIds.length} · card #${cardId}...`);
        try {
          const response = await fetch('/api/quackverse/art/enhance-animate', {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ cardId }),
          });
          const data = await response.json().catch(() => null);
          if (!response.ok || !data?.success) throw new Error(data?.error || `HTTP ${response.status}`);
          successCount += 1;
        } catch (error: any) {
          failures.push(`#${cardId}: ${error?.message || 'failed'}`);
        }
      }

      if (failures.length) {
        setStatus(`Finished ${successCount} / ${cardIds.length}. Failed ${failures.length}: ${failures.slice(0, 3).join('; ')}${failures.length > 3 ? `; +${failures.length - 3} more` : ''}`);
      } else {
        setStatus(`Enhanced and animated all ${successCount} imported cards.`);
      }
    } catch (error: any) {
      setStatus(error?.message || 'Enhance + Animate failed.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="rounded-md border border-fuchsia-300/20 bg-fuchsia-300/10 p-3">
      <div className="text-sm font-semibold text-white">Quackverse media finish</div>
      <div className="mt-1 text-xs text-slate-300">
        One click sends every imported static card through the ecosystem media renderer: 2048×1280 cleanup/upscale plus a smooth 4-second, 12-fps seamless hover GIF.
      </div>
      <Button
        type="button"
        variant="secondary"
        disabled={working}
        className="mt-3 w-full bg-fuchsia-400/20 text-fuchsia-50 hover:bg-fuchsia-400/30"
        onClick={() => void run()}
      >
        {working ? 'Enhancing + Animating...' : 'Enhance + Animate Imported Art'}
      </Button>
      {status && <div className="mt-2 break-words text-xs text-fuchsia-100">{status}</div>}
    </div>
  );
}
