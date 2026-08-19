'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { GAME_HUB_CATALOG } from '@/lib/game-hub-registry';
import { GameOverlayBayHandoff } from '@/components/game-overlay-bay-handoff';

type OverlayProfile = {
  id: string;
  ownerUserId: string;
  ownerLogin: string;
  name: string;
  gameIds: string[];
  layout: 'auto-grid' | 'stack' | 'focus';
  transparent: boolean;
  createdAt: string;
  updatedAt: string;
};

const MAX_GAMES = 8;

export default function GameOverlayStudioPage() {
  const [profiles, setProfiles] = useState<OverlayProfile[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const selected = useMemo(() => profiles.find((profile) => profile.id === selectedId) || profiles[0] || null, [profiles, selectedId]);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const overlayUrl = selected ? `${origin}/overlay/game-hub/${selected.id}` : '';

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/game-hub/overlays', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Overlay profiles returned ${response.status}`);
      const next = Array.isArray(body.profiles) ? body.profiles as OverlayProfile[] : [];
      setProfiles(next);
      setSelectedId((current) => current && next.some((profile) => profile.id === current) ? current : (next[0]?.id || ''));
      setMessage('');
    } catch (error: any) {
      setMessage(error?.message || 'Unable to load game overlays.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadProfiles(); }, [loadProfiles]);

  const replaceProfile = (profile: OverlayProfile) => {
    setProfiles((current) => current.map((item) => item.id === profile.id ? profile : item));
  };

  const createProfile = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/game-hub/overlays', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Games Overlay ${profiles.length + 1}`, gameIds: [], layout: 'auto-grid' }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to create overlay.');
      setProfiles((current) => [body.profile, ...current]);
      setSelectedId(body.profile.id);
      setMessage('Overlay created. Choose any games for this scene.');
    } catch (error: any) { setMessage(error?.message || 'Unable to create overlay.'); }
    finally { setSaving(false); }
  };

  const cloneProfile = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const response = await fetch('/api/game-hub/overlays', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cloneId: selected.id, name: `${selected.name} Copy` }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to clone overlay.');
      setProfiles((current) => [body.profile, ...current]);
      setSelectedId(body.profile.id);
      setMessage('Overlay cloned. Change any games without affecting the original.');
    } catch (error: any) { setMessage(error?.message || 'Unable to clone overlay.'); }
    finally { setSaving(false); }
  };

  const saveProfile = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const response = await fetch('/api/game-hub/overlays', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selected),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to save overlay.');
      replaceProfile(body.profile);
      setMessage('Overlay saved. OBS keeps the same URL.');
    } catch (error: any) { setMessage(error?.message || 'Unable to save overlay.'); }
    finally { setSaving(false); }
  };

  const deleteProfile = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const response = await fetch('/api/game-hub/overlays', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to delete overlay.');
      const remaining = profiles.filter((profile) => profile.id !== selected.id);
      setProfiles(remaining);
      setSelectedId(remaining[0]?.id || '');
      setMessage('Overlay deleted.');
    } catch (error: any) { setMessage(error?.message || 'Unable to delete overlay.'); }
    finally { setSaving(false); }
  };

  const patchLocal = (patch: Partial<OverlayProfile>) => {
    if (!selected) return;
    replaceProfile({ ...selected, ...patch });
  };

  const toggleGame = (gameId: string) => {
    if (!selected) return;
    const current = new Set(selected.gameIds);
    if (current.has(gameId)) current.delete(gameId);
    else if (current.size < MAX_GAMES) current.add(gameId);
    else { setMessage(`Keep each overlay to ${MAX_GAMES} games or fewer. Clone it for another scene.`); return; }
    patchLocal({ gameIds: [...current] });
  };

  return (
    <main className="cosmic-page max-w-7xl" data-workspace-main>
      <section className="cosmic-hero">
        <div className="cosmic-card space-y-4">
          <div className="cosmic-status">Games Hub · Overlay Studio</div>
          <h1 className="cosmic-title">Build overlays like loadouts.</h1>
          <p className="cosmic-subtitle">Create any mix of peer games, clone it for another scene, or make single-game overlays. Every selected game receives the same layout slot; no game is preselected or privileged.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void createProfile()} disabled={saving} className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">New overlay</button>
            {selected && <button type="button" onClick={() => void cloneProfile()} disabled={saving} className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">Clone selected</button>}
          </div>
        </div>
      </section>

      {message && <div className="my-4 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.06] px-4 py-3 text-sm text-cyan-100">{message}</div>}

      {loading ? <section className="cosmic-card mt-5">Loading overlay profiles…</section> : !selected ? (
        <section className="cosmic-card mt-5 space-y-3"><h2 className="font-headline text-xl text-white">No game overlays yet</h2><p className="text-sm text-slate-400">Create one, toggle the games you want, then copy its stable browser-source URL.</p></section>
      ) : (
        <div className="mt-5 grid items-start gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="cosmic-card space-y-2">
            <div className="mb-3 text-xs font-bold uppercase tracking-[.18em] text-slate-500">Your overlays</div>
            {profiles.map((profile) => <button key={profile.id} type="button" onClick={() => setSelectedId(profile.id)} className={`w-full rounded-xl border px-3 py-3 text-left ${profile.id === selected.id ? 'border-primary/35 bg-primary/10' : 'border-white/8 bg-white/[0.025]'}`}><strong className="block text-sm text-white">{profile.name}</strong><span className="mt-1 block text-[10px] text-slate-500">{profile.gameIds.length} game{profile.gameIds.length === 1 ? '' : 's'} · {profile.layout}</span></button>)}
          </aside>

          <section className="space-y-5">
            <div className="cosmic-card space-y-4">
              <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                <label className="grid gap-1 text-xs text-slate-400">Overlay name<input value={selected.name} onChange={(event) => patchLocal({ name: event.target.value })} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white" /></label>
                <label className="grid gap-1 text-xs text-slate-400">Layout<select value={selected.layout} onChange={(event) => patchLocal({ layout: event.target.value as OverlayProfile['layout'] })} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white"><option value="auto-grid">Auto grid</option><option value="stack">Stack</option><option value="focus">Focus first selected</option></select></label>
              </div>
              <label className="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-white/[0.025] p-3 text-sm text-slate-300"><span><strong className="block text-white">Transparent background</strong><small className="text-slate-500">Best for OBS and Overlay Bay composition.</small></span><input type="checkbox" checked={selected.transparent} onChange={(event) => patchLocal({ transparent: event.target.checked })} className="h-5 w-5" /></label>
              <div>
                <div className="text-xs font-bold uppercase tracking-[.18em] text-slate-500">Stable browser-source URL</div>
                <div className="mt-2 rounded-xl bg-black/50 px-3 py-3 font-mono text-xs text-cyan-100 break-all">{overlayUrl}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void navigator.clipboard.writeText(overlayUrl)} className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-bold text-cyan-100">Copy URL</button>
                  <button type="button" onClick={() => window.open(overlayUrl, '_blank', 'noopener,noreferrer')} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white">Open overlay</button>
                  <GameOverlayBayHandoff profileId={selected.id} profileName={selected.name} overlayUrl={overlayUrl} />
                </div>
                <p className="mt-2 text-[10px] leading-4 text-slate-500">Overlay Bay receives this profile as a normal Web source. SPMT still owns scene position, size, layering, and the final Save.</p>
              </div>
            </div>

            <div className="cosmic-card">
              <div className="flex items-end justify-between gap-3"><div><h2 className="font-headline text-xl text-white">Games in this overlay</h2><p className="mt-1 text-xs text-slate-500">Toggle up to {MAX_GAMES}. All {GAME_HUB_CATALOG.length} games use the same slot contract.</p></div><strong className="text-sm text-cyan-100">{selected.gameIds.length}/{MAX_GAMES}</strong></div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {GAME_HUB_CATALOG.map((game) => { const enabled = selected.gameIds.includes(game.id); return <button key={game.id} type="button" onClick={() => toggleGame(game.id)} className={`rounded-xl border p-3 text-left transition ${enabled ? 'border-cyan-300/35 bg-cyan-300/10' : 'border-white/8 bg-white/[0.025]'}`}><div className="flex items-center justify-between gap-2"><strong className="text-sm text-white">{game.name}</strong><span className={`h-3 w-3 rounded-full ${enabled ? 'bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,.7)]' : 'bg-white/10'}`} /></div><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-500">{game.description}</p></button>; })}
              </div>
              <div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => void saveProfile()} disabled={saving} className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">{saving ? 'Saving…' : 'Save overlay'}</button><button type="button" onClick={() => void deleteProfile()} disabled={saving} className="rounded-full border border-rose-300/20 bg-rose-300/[0.06] px-5 py-2.5 text-sm font-bold text-rose-200 disabled:opacity-50">Delete</button></div>
            </div>

            <div className="cosmic-card">
              <h2 className="font-headline text-lg text-white">Live preview</h2>
              <p className="mt-1 text-xs text-slate-500">This is the exact composite URL you can add to OBS or register as a Web source in SPMT Overlay Bay.</p>
              <div className="mt-3 aspect-video overflow-hidden rounded-xl border border-white/10 bg-slate-950"><iframe key={`${selected.id}-${selected.updatedAt}`} src={overlayUrl} title={`${selected.name} preview`} className="h-full w-full border-0 bg-transparent" /></div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
