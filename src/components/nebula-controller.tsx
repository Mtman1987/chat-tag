'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { GameHubGame } from '@/lib/game-hub-catalog';
import { canonicalPlayerCommands, canonicalStreamerCommands } from '@/lib/game-hub-commands';
import { useSession } from '@/contexts/session-context';
import { GameHubPlayPanel } from '@/components/game-hub-play-panel';
import { BingoTranscriptControl } from '@/components/bingo-transcript-control';

type MosaicSnapshot = {
  artwork: null | {
    id: string; theme: string; requestedBy?: string; status: string; activeBoard: number; viewMode: 'board'|'all';
    target: string[]; painted: string[]; width: number; height: number; progress: number; total: number;
    paletteId?: string; palette?: Record<string,string>; finalImageUrl?: string;
  };
  queueLength: number;
  queue?: Array<{position:number;id:string;theme:string;displayName:string;status:string;attempts:number}>;
  saves?: Array<{id:string;theme:string;status:string;updatedAt:string;createdAt:string;paletteId:string;requestedBy:string}>;
  premium?: {testingFree:boolean;capabilities:Record<string,boolean>};
};

const CLASSIC: Record<string,string> = {R:'#ef4444',B:'#3b82f6',G:'#22c55e',Y:'#eab308',P:'#a855f7',O:'#f97316',PK:'#ec4899',W:'#f8fafc',K:'#111827',C:'#06b6d4'};
const mosaicTabs = ['Board','Command','Queue','Saves','Palette','Guide','Commlink'] as const;
const bingoTabs = ['Live','Mic','Command','Guide','Commlink'] as const;
const basicTabs = ['Live','Command','Guide','Commlink'] as const;
type Tab = typeof mosaicTabs[number] | typeof bingoTabs[number] | typeof basicTabs[number];

function channelOf(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/^#/,'');
}

function MosaicBoard({ snapshot }: { snapshot: MosaicSnapshot }) {
  const art = snapshot.artwork;
  if (!art) return <div className="grid min-h-[460px] place-items-center rounded-3xl border border-cyan-300/10 bg-slate-950/85 p-8 text-center text-slate-400"><div><strong className="block text-xl text-white">No Mosaic loaded</strong><span className="mt-2 block text-sm">Queue a theme from the Command tab.</span></div></div>;
  const palette = art.palette || CLASSIC;
  const columns = art.width;
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><div className="text-xs font-black uppercase tracking-[.2em] text-cyan-300">{art.status} · board {art.activeBoard}</div><h2 className="mt-1 text-2xl font-black text-white">{art.theme}</h2><p className="text-xs text-slate-400">{art.progress}/{art.total} correct · {Math.round((art.progress/Math.max(1,art.total))*100)}%</p></div>
      {art.finalImageUrl ? <a href={art.finalImageUrl} target="_blank" rel="noopener noreferrer" className="rounded-full bg-emerald-300 px-4 py-2 text-xs font-black text-slate-950 no-underline">Reveal final image</a> : null}
    </div>
    <div className="grid aspect-[4/5] w-full overflow-hidden rounded-2xl border border-white/10 bg-black p-1 shadow-[0_0_50px_rgba(34,211,238,.12)]" style={{gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`}}>
      {art.target.map((target,index) => {
        const painted = art.painted[index];
        return <span key={index} className="min-h-0 min-w-0 border border-slate-900/30" style={{background: painted ? (palette[painted] || CLASSIC[painted]) : '#020617', color: palette[target] || CLASSIC[target]}} title={painted ? `${painted}` : `Needs ${target}`}>
          {!painted && art.width <= 20 ? <span className="grid h-full place-items-center text-[clamp(5px,.8vw,10px)] font-black">{target}</span> : null}
        </span>;
      })}
    </div>
  </div>;
}

export function NebulaController({ game }: { game: GameHubGame }) {
  const params = useSearchParams();
  const { user } = useSession();
  const channel = channelOf(params.get('channel') || user?.twitchUsername || '');
  const [tab,setTab] = useState<Tab>(game.id === 'pixelbattle' ? 'Board' : 'Live');
  const [command,setCommand] = useState('');
  const [reply,setReply] = useState('');
  const [busy,setBusy] = useState(false);
  const [mosaic,setMosaic] = useState<MosaicSnapshot>({artwork:null,queueLength:0});
  const isMosaic = game.id === 'pixelbattle';
  const isBingo = game.id === 'bingo';

  async function refreshMosaic() {
    if (!isMosaic || !channel) return;
    try {
      const response = await fetch(`/api/game-hub/mosaic?channel=${encodeURIComponent(channel)}`,{cache:'no-store'});
      if (response.ok) setMosaic(await response.json());
    } catch {}
  }

  useEffect(() => {
    if (!isMosaic || !channel) return;
    let cancelled=false;
    const load=async()=>{ if(cancelled)return; await refreshMosaic(); };
    void load();
    const timer=window.setInterval(load,1200);
    return()=>{cancelled=true;window.clearInterval(timer)};
  },[isMosaic,channel]);

  async function run(message: string) {
    if (!channel || !message.trim() || busy) return;
    setBusy(true); setReply('');
    try {
      const response=await fetch('/api/game-hub/controller-command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel,message:message.trim()})});
      const body=await response.json().catch(()=>({}));
      setReply(String(body.reply || body.error || (response.ok?'Command accepted.':`Command failed (${response.status}).`)));
      if (response.ok) { setCommand(''); await refreshMosaic(); }
    } catch (error:any) { setReply(error?.message || 'Controller command failed.'); }
    finally { setBusy(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(command);
  }

  const controllerTabs = useMemo<Tab[]>(() => isMosaic ? [...mosaicTabs] : isBingo ? [...bingoTabs] : [...basicTabs], [isMosaic,isBingo]);
  const playerCommands = useMemo(() => canonicalPlayerCommands(game), [game]);
  const streamerCommands = useMemo(() => canonicalStreamerCommands(game), [game]);
  const quickCommands = useMemo(() => [...playerCommands, ...streamerCommands]
    .filter((item, index, all) => all.findIndex((entry) => entry.trigger === item.trigger) === index)
    .slice(0, 12), [playerCommands, streamerCommands]);
  const premium = mosaic.premium;
  return <div className="min-h-screen bg-[radial-gradient(circle_at_top,#12335b_0%,#071225_40%,#020617_100%)] text-white">
    <header className="sticky top-0 z-20 border-b border-cyan-300/10 bg-slate-950/90 px-4 py-3 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div><div className="text-[10px] font-black uppercase tracking-[.26em] text-cyan-300">Nebula Controller</div><h1 className="text-xl font-black">{game.name}</h1><p className="text-xs text-slate-400">Private control service · #{channel || 'no-channel'}</p></div>
        <div className="flex flex-wrap gap-2">
          {controllerTabs.map(item=><button key={item} onClick={()=>setTab(item)} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${tab===item?'border-cyan-300/50 bg-cyan-300/15 text-cyan-100':'border-white/10 bg-white/[.03] text-slate-400 hover:bg-white/[.06]'}`}>{item}</button>)}
        </div>
      </div>
    </header>
    <main className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="min-w-0 rounded-3xl border border-white/10 bg-slate-950/55 p-4 shadow-2xl">
        {(tab==='Board' || tab==='Live') ? (isMosaic ? <MosaicBoard snapshot={mosaic}/> : <div className="space-y-4"><div><div className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">Live game surface</div><p className="mt-1 text-sm text-slate-400">This is the same game surface used elsewhere in Nebula, wrapped in private controller chrome.</p></div><GameHubPlayPanel game={game}/></div>) : null}
        {tab==='Mic' && isBingo ? <BingoTranscriptControl channel={channel}/> : null}
        {tab==='Command' ? <div className="space-y-5">
          <div><h2 className="text-2xl font-black">Private command console</h2><p className="mt-1 text-sm text-slate-400">Runs the real Nebula command handler without sending a message to Twitch or Discord.</p></div>
          <form onSubmit={submit} className="flex gap-2"><input value={command} onChange={e=>setCommand(e.target.value)} placeholder={isMosaic?'spmt D12Y':'spmt ...'} className="min-w-0 flex-1 rounded-2xl border border-cyan-300/20 bg-black/50 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60"/><button disabled={busy||!command.trim()} className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-40">Run</button></form>
          {reply ? <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[.06] p-4 text-sm text-cyan-50">{reply}</div> : null}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(isMosaic
              ? ['spmt show 1','spmt show 2','spmt show 3','spmt show 4','spmt show all','spmt brush 1','spmt brush 3 right','spmt brush 3 left','spmt brush 3 down','spmt brush 3 up','spmt mosaic queue','spmt mosaic finish'].map((trigger)=>({trigger,description:'Mosaic quick control'}))
              : quickCommands
            ).map(item=><button key={item.trigger} onClick={()=>void run(item.trigger)} className="rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-left text-xs font-bold text-slate-200 hover:bg-white/[.07]"><code>{item.trigger}</code><span className="mt-1 block font-normal text-slate-500">{item.description}</span></button>)}
          </div>
        </div> : null}
        {tab==='Queue' && isMosaic ? <div className="space-y-4"><div><h2 className="text-2xl font-black">Theme queue</h2><p className="text-sm text-slate-400">Streamer/mod veto lives here. Chat can suggest; the channel owner gets the last say.</p></div>
          {mosaic.queue?.length ? mosaic.queue.map(item=><div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[.025] p-3"><div className="min-w-0"><strong className="block truncate">#{item.position} · {item.theme}</strong><span className="text-xs text-slate-500">{item.displayName} · {item.status}</span></div><button onClick={()=>void run(`spmt mosaic remove ${item.position}`)} className="rounded-full border border-rose-300/20 bg-rose-300/10 px-3 py-1.5 text-xs font-bold text-rose-100">Remove</button></div>) : <p className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-slate-500">Queue is empty.</p>}
          <button onClick={()=>void run('spmt mosaic clearqueue')} className="rounded-full border border-rose-300/20 bg-rose-300/10 px-4 py-2 text-xs font-bold text-rose-100">Clear queue</button>
        </div> : null}
        {tab==='Saves' && isMosaic ? <div className="space-y-4"><div><h2 className="text-2xl font-black">Saved mosaics</h2><p className="text-sm text-slate-400">Completed and suspended work is durable. During testing, project features are unlocked.</p></div>
          <div className="grid gap-3 md:grid-cols-2">{mosaic.saves?.length ? mosaic.saves.map(save=><article key={save.id} className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><strong>{save.theme}</strong><div className="mt-1 text-xs text-slate-500">{save.status} · {save.paletteId} · {save.requestedBy}</div></article>) : <p className="text-sm text-slate-500">No saved mosaics yet.</p>}</div>
          <button onClick={()=>void run('spmt mosaic replay')} className="rounded-full bg-violet-300 px-4 py-2 text-xs font-black text-slate-950">Replay current/saved Mosaic</button>
        </div> : null}
        {tab==='Palette' && isMosaic ? <div className="space-y-5"><div><h2 className="text-2xl font-black">Palette remix</h2><p className="text-sm text-slate-400">Change the presentation without changing the puzzle. Test period: free/unlocked.</p></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{['classic','neon','pastel','mono','ocean'].map(name=><button key={name} onClick={()=>void run(`spmt mosaic palette ${name}`)} className={`rounded-2xl border p-4 text-left ${mosaic.artwork?.paletteId===name?'border-violet-300/60 bg-violet-300/10':'border-white/10 bg-white/[.025]'}`}><strong className="capitalize">{name}</strong><span className="mt-1 block text-xs text-slate-500">Apply to live + reveal</span></button>)}</div>
        </div> : null}
        {tab==='Guide' ? <div className="space-y-5">
          <div><div className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">{game.category} · {game.runtime}</div><h2 className="mt-1 text-2xl font-black">{game.name}</h2><p className="mt-2 text-sm leading-6 text-slate-300">{game.howToPlay}</p></div>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><h3 className="font-black text-white">Player controls</h3><div className="mt-3 space-y-2">{playerCommands.map(item=><div key={item.trigger} className="rounded-xl border border-white/8 bg-black/20 p-3"><code className="text-cyan-100">{item.trigger}</code><p className="mt-1 text-xs text-slate-400">{item.description}</p></div>)}</div></section>
            <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><h3 className="font-black text-white">Streamer controls</h3><div className="mt-3 space-y-2">{streamerCommands.map(item=><div key={item.trigger} className="rounded-xl border border-white/8 bg-black/20 p-3"><code className="text-emerald-100">{item.trigger}</code><p className="mt-1 text-xs text-slate-400">{item.description}</p></div>)}</div></section>
          </div>
          {game.chatSignals?.length ? <div className="rounded-2xl border border-violet-300/15 bg-violet-300/[.05] p-4"><div className="text-xs font-black uppercase tracking-[.16em] text-violet-200">Passive input</div><p className="mt-2 text-sm text-slate-300">{game.chatSignals.join(' · ')}</p></div> : null}
        </div> : null}
        {tab==='Commlink' ? <div className="space-y-4"><div><h2 className="text-2xl font-black">Commlink</h2><p className="text-sm text-slate-400">Communications stay in Commlink. The private command console above is game control, not another public chat transport.</p></div><iframe src="/messages" title="Commlink" className="h-[68vh] min-h-[520px] w-full rounded-2xl border border-white/10 bg-slate-950"/><a href="https://spmt.live/?view=commlink" target="_blank" rel="noopener noreferrer" className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs font-bold text-cyan-100 no-underline">Open full Commlink workspace</a></div> : null}
      </section>
      <aside className="space-y-3">
        <div className="rounded-3xl border border-cyan-300/15 bg-cyan-300/[.05] p-4"><div className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">Controller status</div><dl className="mt-3 grid gap-2 text-sm"><div className="flex justify-between gap-2"><dt className="text-slate-500">Channel</dt><dd>#{channel||'—'}</dd></div>{isMosaic?<><div className="flex justify-between gap-2"><dt className="text-slate-500">Queue</dt><dd>{mosaic.queueLength}</dd></div><div className="flex justify-between gap-2"><dt className="text-slate-500">Palette</dt><dd className="capitalize">{mosaic.artwork?.paletteId||'classic'}</dd></div></>:null}</dl></div>
        {isMosaic ? <div className="rounded-3xl border border-violet-300/15 bg-violet-300/[.05] p-4"><div className="text-xs font-black uppercase tracking-[.18em] text-violet-200">Project features</div><p className="mt-2 text-xs text-slate-400">{premium?.testingFree!==false?'Unlocked during testing.':'Entitlements apply.'}</p><div className="mt-3 grid gap-1.5 text-xs text-slate-300"><span>✓ Solo projects</span><span>✓ Saved projects</span><span>✓ Friend sessions</span><span>✓ Palette remix</span></div></div> : null}
      </aside>
    </main>
  </div>;
}
