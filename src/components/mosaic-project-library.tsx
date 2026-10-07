'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
type Project = { id: string; theme: string; channel?: string; status?: string; sharedId?: string };
type Library = { own: Project[]; gallery: Project[]; selected?: Project; canManage: boolean };
const api = '/api/game-hub/mosaic/projects';
const button = 'rounded-xl border border-cyan-300/30 px-3 py-2 text-sm font-bold hover:bg-cyan-300/10 disabled:opacity-40';
export function MosaicProjectLibrary({ channel }: { channel: string }) {
  const params = useSearchParams();
  const selected = params.get('shared') || '';
  const [library, setLibrary] = useState<Library>({ own: [], gallery: [], canManage: false });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [replace, setReplace] = useState(false);
  async function refresh() {
    const response = await fetch(`${api}?channel=${encodeURIComponent(channel)}${selected ? `&shared=${encodeURIComponent(selected)}` : ''}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load paintings.');
    setLibrary(data);
  }
  useEffect(() => { let mounted = true; void refresh().catch(error => { if (mounted) setMessage(error.message); }); return () => { mounted = false; }; }, [channel, selected]);
  async function act(body: Record<string, unknown>) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, channel, replace }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update painting.');
      await refresh();
      setMessage(['start','import','resume'].includes(String(body.action)) ? 'Painting started. Open Board to play.' : body.action === 'publish' ? 'Painting shared. Copy its link below.' : 'Painting removed from the shared gallery.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update painting.'); }
    finally { setBusy(false); }
  }
  const download = (project: Project, shared: boolean, format: string) => `${api}?${shared ? `shared=${encodeURIComponent(project.id)}` : `channel=${encodeURIComponent(channel)}&artworkId=${encodeURIComponent(project.id)}`}&format=${format}`;
  const card = (project: Project, shared: boolean) => <article key={project.id} className="space-y-3 rounded-2xl border border-white/10 bg-white/[.025] p-4">
    {shared ? <img src={download(project, true, 'png')} alt={project.theme} loading="lazy" className="h-48 w-full rounded-xl object-contain bg-slate-950"/> : null}
    <h3 className="font-bold">{project.theme}</h3><p className="text-xs text-slate-400">{shared ? `Shared by #${project.channel}` : project.status}</p>
    <div className="flex flex-wrap gap-2">
      {!shared && project.status === 'suspended' && library.canManage ? <button className={button} disabled={busy} onClick={() => void act({ action: 'resume', artworkId: project.id })}>Resume saved progress</button> : null}
      <button className={button} disabled={busy || !library.canManage} onClick={() => void act({ action: 'start', ...(shared ? { shared: project.id } : { artworkId: project.id }) })}>Start fresh copy</button>
      <a className={button} href={download(project, shared, 'png')}>Download image</a>
      <a className={button} href={download(project, shared, 'json')}>Download project</a>
      {shared && project.channel === channel && library.canManage ? <button className={button} disabled={busy} onClick={() => void act({ action: 'unpublish', shared: project.id })}>Stop sharing</button> : null}
      {!shared && library.canManage ? <button className={button} disabled={busy} onClick={() => void act({ action: project.sharedId ? 'unpublish' : 'publish', artworkId: project.id })}>{project.sharedId ? 'Stop sharing' : 'Share to gallery'}</button> : null}
    </div>
    {!shared && project.sharedId ? <div className="space-y-2"><a className="block break-all text-sm text-cyan-200" href={`/games/pixelbattle/controller?tab=Saves&shared=${encodeURIComponent(project.sharedId)}`}>Open shared painting</a><button className={button} onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/games/pixelbattle/controller?tab=Saves&shared=${encodeURIComponent(project.sharedId!)}`).then(() => setMessage('Sharing link copied.')).catch(() => setMessage('Open the shared painting and copy the address from your browser.'))}>Copy sharing link</button></div> : null}
  </article>;
  return <div className="space-y-6">
    <div><h2 className="text-2xl font-black">Saved mosaics</h2><p className="mt-2 text-sm text-slate-400">Games stay available until you stop them. Share a design with other tenants, or download it to your computer. A fresh copy starts with an empty board and keeps the original painting intact.</p></div>
    {message ? <p role="status" className="rounded-xl bg-cyan-300/10 p-3">{message}</p> : null}
    {library.canManage ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={replace} onChange={event => setReplace(event.target.checked)}/> Save my active painting and switch when starting a copy</label> : <p className="text-sm text-slate-400">Open this gallery in your own channel controller to start a painting.</p>}
    {library.selected ? <section><h3 className="mb-3 font-bold">Painting shared with you</h3>{card(library.selected, true)}</section> : null}
    <div className="grid gap-3 md:grid-cols-2">{library.own.map(project => card(project, false))}</div>
    {!library.own.length ? <p className="text-sm text-slate-400">Your saved paintings will appear here.</p> : null}
    {library.canManage ? <label className="block rounded-xl border border-white/10 p-4"><span className="block font-bold">Import a downloaded project</span><span className="mb-3 block text-xs text-slate-400">Choose a Nebula Mosaic JSON file to start a fresh copy.</span><input type="file" accept=".json,application/json" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; if (file.size > 100_000) { setMessage('Project file is too large.'); return; } void file.text().then(text => act({ action: 'import', template: JSON.parse(text) })).catch(() => setMessage('Choose a valid Nebula Mosaic JSON project.')); }}/></label> : null}
    <section><h3 className="mb-3 text-xl font-black">Shared gallery</h3><p className="mb-3 text-sm text-slate-400">Only paintings their owners choose to share appear here.</p><div className="grid gap-3 md:grid-cols-2">{library.gallery.map(project => card(project, true))}</div>{!library.gallery.length ? <p className="text-sm text-slate-400">Be the first to share a painting.</p> : null}</section>
    <section className="rounded-2xl border border-violet-300/30 bg-violet-300/10 p-5"><span className="text-xs font-black uppercase tracking-wider text-violet-200">Coming soon</span><h3 className="mt-2 text-xl font-black">Order your diamond painting in real life</h3><p className="mt-2 text-sm text-slate-300">Turn your Mosaic design into a physical diamond painting kit. Ordering is coming soon.</p><button disabled className={`${button} mt-4`}>Order a diamond painting · Coming soon</button></section>
  </div>;
}
