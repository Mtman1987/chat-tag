'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { GameHubGame } from '@/lib/game-hub-catalog';
import { canonicalPlayerCommands, canonicalStreamerCommands } from '@/lib/game-hub-commands';
import { useSession } from '@/contexts/session-context';
import { GameHubPlayPanel } from '@/components/game-hub-play-panel';
import { Quackdex } from '@/components/quackdex';
import { GameControllerShare } from '@/components/game-controller-share';
import { StellaControllerGuide } from '@/components/stella-controller-guide';
import { MosaicCoordinateBoard } from '@/components/mosaic-coordinate-board';
import { useMosaicReveal } from '@/components/use-mosaic-reveal';
import type { mosaicPricing } from '@/lib/mosaic-prices';
import { MosaicTouchControls } from '@/components/mosaic-touch-controls';
import { BingoTranscriptControl } from '@/components/bingo-transcript-control';

type MosaicSnapshot = {
  artwork: null | {
    id: string; theme: string; requestedBy?: string; status: string; activeBoard: number; viewMode: 'board'|'all';
    target: string[]; painted: string[]; width: number; height: number; progress: number; total: number;
    paletteId?: string; palette?: Record<string,string>; finalImageUrl?: string; revealUntil?: string;
  };
  pricing?: ReturnType<typeof mosaicPricing>;
  queueLength: number;
  queue?: Array<{position:number;id:string;theme:string;displayName:string;status:string;attempts:number}>;
  saves?: Array<{id:string;theme:string;status:string;updatedAt:string;createdAt:string;paletteId:string;requestedBy:string}>;
  premium?: {testingFree:boolean;capabilities:Record<string,boolean>};
};

const mosaicTabs = ['Board','Click & touch','Command','Queue','Saves','Palette','Guide','Share','Comms Lounge'] as const;
const bingoTabs = ['Live','Mic','Command','Guide','Share','Comms Lounge'] as const;
const basicTabs = ['Live','Command','Guide','Share','Comms Lounge'] as const;
const quackverseTabs = ['Live','Quackdex','Command','Guide','Share','Comms Lounge'] as const;
type Tab = typeof quackverseTabs[number] | typeof mosaicTabs[number] | typeof bingoTabs[number] | typeof basicTabs[number];

function channelOf(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/^#/,'');
}

function MosaicBoard({ snapshot, onCell, disabled, expanded = false }: { snapshot: MosaicSnapshot; expanded?: boolean; onCell?: (coordinate: string, board: number) => void; disabled?: boolean }) {
  const art = snapshot.artwork;
  const revealSeconds = useMosaicReveal(art?.revealUntil);
  const [cellSize, setCellSize] = useState<number | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const fit = () => {
      // Fit the complete board below the controller headers, including inside
      // short popouts. Width remains bounded by the controller's content area.
      const height = Math.max(200, Math.min(window.innerHeight - 24, window.innerHeight - frame.getBoundingClientRect().top - 28));
      setAvailableHeight(current => current !== null && Math.abs(current - height) < 1 ? current : height);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    if (frame.parentElement) observer.observe(frame.parentElement);
    window.addEventListener('resize', fit);
    return () => { observer.disconnect(); window.removeEventListener('resize', fit); };
  }, [art?.id, art?.width, art?.height, expanded]);
  if (!art) return <div className="grid min-h-[460px] place-items-center rounded-3xl border border-cyan-300/10 bg-slate-950/85 p-8 text-center text-slate-400"><div><strong className="block text-xl text-white">No Mosaic loaded</strong><span className="mt-2 block text-sm">Queue a theme from the Command tab.</span></div></div>;
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><div className="text-xs font-black uppercase tracking-[.2em] text-cyan-300">{art.status} · board {art.activeBoard}</div><h2 className="mt-1 text-2xl font-black text-white">{art.theme}</h2><p className="text-xs text-slate-400">{art.progress}/{art.total} correct · {Math.round((art.progress/Math.max(1,art.total))*100)}%</p></div>
      {art.finalImageUrl ? <a href={art.finalImageUrl} target="_blank" rel="noopener noreferrer" className="rounded-full bg-emerald-300 px-4 py-2 text-xs font-black text-slate-950 no-underline">Reveal final image</a> : null}
    </div>
    <div className="flex flex-wrap items-center gap-2 text-sm"><button onClick={() => setCellSize(32)} className="rounded-lg border border-white/20 px-3 py-2">Readable</button><button aria-label="Smaller squares" onClick={() => setCellSize(Math.max(24, (cellSize || 32) - 4))} className="rounded-lg border border-white/20 px-3 py-2">−</button><button aria-label="Larger squares" onClick={() => setCellSize(Math.min(48, (cellSize || 32) + 4))} className="rounded-lg border border-white/20 px-3 py-2">+</button><button onClick={() => setCellSize(null)} className="rounded-lg border border-white/20 px-3 py-2">Fit screen</button><span className="text-xs text-slate-400">{cellSize ? 'Scroll the board; letters and numbers stay pinned.' : 'Whole board · expand the game for a larger view'}</span></div>
    {revealSeconds > 0 ? <p role="status" className="text-sm font-bold text-violet-200">Completed-picture preview · {revealSeconds}s left · progress unchanged</p> : null}
    <div ref={frameRef} className="flex min-w-0 justify-center">
      {revealSeconds > 0 ? <div aria-label="Temporary completed Mosaic preview" className="grid w-full" style={{ maxWidth: (availableHeight || 700) * art.width / art.height, aspectRatio: `${art.width}/${art.height}`, gridTemplateColumns: `repeat(${art.width}, minmax(0,1fr))` }}>{art.target.map((color, index) => <span key={index} style={{ background: art.palette?.[color] }} />)}</div> : <MosaicCoordinateBoard art={art} availableHeight={availableHeight} cellSize={cellSize} onCell={onCell} disabled={disabled || art.status !== 'active'} />}
    </div>
  </div>;
}

export function NebulaController({ game, initialTab }: { game: GameHubGame; initialTab?: 'Quackdex' | 'Click & touch' }) {
  const params = useSearchParams();
  const { user } = useSession();
  const channel = channelOf(params.get('channel') || user?.twitchUsername || '');
  const [tab,setTab] = useState<Tab>(initialTab || (game.id === 'quackverse' && params.get('tab')?.toLowerCase() === 'quackdex' ? 'Quackdex' : game.id === 'pixelbattle' ? 'Board' : 'Live'));
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', close);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', close); };
  }, [expanded]);
  const [command,setCommand] = useState('');
  const [reply,setReply] = useState('');
  const [busy,setBusy] = useState(false);
  const [loungeMessage,setLoungeMessage] = useState('');
  const [loungeLog,setLoungeLog] = useState<Array<{id:number;message:string;reply:string;mode:string}>>([]);
  const [mosaic,setMosaic] = useState<MosaicSnapshot>({artwork:null,queueLength:0});
  const isMosaic = game.id === 'pixelbattle';
  const isBingo = game.id === 'bingo';
  const isQuackverse = game.id === 'quackverse';

  useEffect(() => {
    if (isQuackverse && (initialTab === 'Quackdex' || params.get('tab')?.toLowerCase() === 'quackdex')) setTab('Quackdex');
  }, [initialTab, isQuackverse, params]);

  const refreshMosaic = useCallback(async () => {
    if (!isMosaic || !channel) return;
    try {
      const response = await fetch(`/api/game-hub/mosaic?channel=${encodeURIComponent(channel)}`,{cache:'no-store'});
      if (response.ok) setMosaic(await response.json());
    } catch {}
  }, [isMosaic, channel]);

  useEffect(() => {
    if (!isMosaic || !channel) return;
    let cancelled=false;
    const load=async()=>{ if(cancelled)return; await refreshMosaic(); };
    void load();
    const timer=window.setInterval(load,1200);
    return()=>{cancelled=true;window.clearInterval(timer)};
  },[isMosaic,channel,refreshMosaic]);

  async function run(message: string) {
    if (!channel || !message.trim() || busy) return;
    setBusy(true); setReply('');
    try {
      const response=await fetch('/api/game-hub/controller-command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel,message:message.trim(),gameId:game.id,commandMode:true})});
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

  async function submitLounge(event: FormEvent) {
    event.preventDefault();
    const message = loungeMessage.trim();
    if (!channel || !message || busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/game-hub/controller-command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel,message})});
      const body = await response.json().catch(()=>({}));
      const resultText = String(body.reply || body.error || (response.ok?'Private game input accepted.':`Private game input failed (${response.status}).`));
      setLoungeLog((current)=>[...current,{id:Date.now(),message,reply:resultText,mode:String(body.mode||'chat')}].slice(-30));
      if (response.ok) { setLoungeMessage(''); await refreshMosaic(); }
    } catch (error:any) {
      setLoungeLog((current)=>[...current,{id:Date.now(),message,reply:error?.message||'Private game input failed.',mode:'error'}].slice(-30));
    } finally { setBusy(false); }
  }

  const overlayUrl = channel ? `/overlay/game-hub/instant.${channel}.${game.id}` : '';
  const controllerTabs = useMemo<Tab[]>(() => isMosaic ? [...mosaicTabs] : isBingo ? [...bingoTabs] : isQuackverse ? [...quackverseTabs] : [...basicTabs], [isMosaic,isBingo,isQuackverse]);
  const playerCommands = useMemo(() => canonicalPlayerCommands(game), [game]);
  const streamerCommands = useMemo(() => canonicalStreamerCommands(game), [game]);
  const quickCommands = useMemo(() => [...playerCommands, ...streamerCommands]
    .filter((item, index, all) => all.findIndex((entry) => entry.trigger === item.trigger) === index)
    .slice(0, 12), [playerCommands, streamerCommands]);
  const premium = mosaic.premium;
  const testingFree = mosaic.pricing?.testingFree === true;
  const canManage = Boolean(user && (channel === channelOf(user.twitchUsername) || user.isAdmin || user.role === 'owner'));
  return <div className={`${expanded ? 'fixed inset-0 z-[1000] overflow-y-auto' : 'min-h-screen'} bg-[radial-gradient(circle_at_top,#12335b_0%,#071225_40%,#020617_100%)] text-white`}>
    <header className={`${tab === 'Quackdex' ? 'relative' : 'sticky top-0'} z-20 border-b border-cyan-300/10 bg-slate-950/90 px-4 py-3 backdrop-blur-xl`}>
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
        <div><div className="text-[10px] font-black uppercase tracking-[.26em] text-cyan-300">Nebula Controller</div><h1 className="text-xl font-black">{isQuackverse && tab === 'Quackdex' ? 'Quackdex' : game.name}</h1><p className="text-xs text-slate-400">{tab === 'Quackdex' ? 'Your cards, decks, and trades' : `Controls for #${channel || 'no-channel'}`}</p></div>
        <div className="flex flex-wrap gap-2">
          {isMosaic ? <button type="button" onClick={() => setExpanded(value => !value)} className="rounded-full border border-cyan-300/40 bg-cyan-300/15 px-3 py-1.5 text-xs font-bold text-cyan-100">{expanded ? 'Exit expanded view' : 'Expand game'}</button> : null}
          <button onClick={() => setTab('Guide')} className="rounded-full border border-violet-300/30 bg-violet-300/10 px-3 py-1.5 text-xs font-bold text-violet-100">✦ Stella help</button>
          {controllerTabs.map(item=><button key={item} onClick={()=>setTab(item)} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${tab===item?'border-cyan-300/50 bg-cyan-300/15 text-cyan-100':'border-white/10 bg-white/[.03] text-slate-400 hover:bg-white/[.06]'}`}>{item}</button>)}
        </div>
      </div>
    </header>
    <main className={`mx-auto grid max-w-[1600px] gap-4 p-4 ${tab === 'Quackdex' ? '' : 'lg:grid-cols-[minmax(0,1fr)_300px]'}`}>
      <section className="min-w-0 rounded-3xl border border-white/10 bg-slate-950/55 p-4 shadow-2xl">
        {(tab==='Board' || tab==='Live') ? (isMosaic ? <MosaicBoard snapshot={mosaic} expanded={expanded}/> : <div className="space-y-4"><div><div className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">Live game</div><p className="mt-1 text-sm text-slate-400">Play along in Twitch chat. Open Share to put this game on your stream or in Discord.</p></div><GameHubPlayPanel game={game}/></div>) : null}
        {tab==='Click & touch' && isMosaic ? <MosaicTouchControls testingFree={testingFree} channel={channel} signedIn={Boolean(user)} artworkId={mosaic.artwork?.id} run={run} refresh={refreshMosaic} renderBoard={(onCell, disabled) => <MosaicBoard snapshot={mosaic} expanded={expanded} onCell={onCell} disabled={disabled} />} /> : null}
        {tab==='Share' ? <GameControllerShare game={game} channel={channel} canManage={canManage}/> : null}
        {tab==='Quackdex' && isQuackverse ? <Quackdex /> : null}
        {tab==='Mic' && isBingo ? <BingoTranscriptControl channel={channel}/> : null}
        {tab==='Command' ? <div className="space-y-5">
          <div><h2 className="text-2xl font-black">Private command console</h2><p className="mt-1 text-sm text-slate-400">Runs the real Nebula command handler without sending a message to Twitch or Discord.</p></div>
          <form onSubmit={submit} className="flex gap-2"><input value={command} onChange={e=>setCommand(e.target.value)} placeholder={isMosaic?'D12Y or spmt D12Y':'Command, with or without spmt'} className="min-w-0 flex-1 rounded-2xl border border-cyan-300/20 bg-black/50 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60"/><button disabled={busy||!command.trim()} className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-40">Run</button></form>
          {reply ? <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[.06] p-4 text-sm text-cyan-50">{reply}</div> : null}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(isMosaic
              ? ['spmt show 1','spmt show 2','spmt show 3','spmt show 4','spmt show all','spmt brush 1','spmt brush 3 right','spmt brush 3 left','spmt brush 3 down','spmt brush 3 up','spmt mosaic queue','spmt reveal'].map((trigger)=>({trigger,description: trigger === 'spmt reveal' ? `${testingFree ? 'Free this week' : '100 Nebula points'} · completed preview for 15 seconds` : trigger.startsWith('spmt brush 3') ? (testingFree ? 'Free this week' : '100 Nebula points once per artwork') : 'Mosaic quick control'}))
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
          <div><div className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">Stella’s guide</div><h2 className="mt-1 text-2xl font-black">{game.name}</h2><p className="mt-2 text-sm leading-6 text-slate-300">{game.howToPlay}</p></div>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><h3 className="font-black text-white">Player controls</h3><div className="mt-3 space-y-2">{playerCommands.map(item=><div key={item.trigger} className="rounded-xl border border-white/8 bg-black/20 p-3"><code className="text-cyan-100">{item.trigger}</code><p className="mt-1 text-xs text-slate-400">{item.description}</p></div>)}</div></section>
            <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><h3 className="font-black text-white">Streamer controls</h3><div className="mt-3 space-y-2">{streamerCommands.map(item=><div key={item.trigger} className="rounded-xl border border-white/8 bg-black/20 p-3"><code className="text-emerald-100">{item.trigger}</code><p className="mt-1 text-xs text-slate-400">{item.description}</p></div>)}</div></section>
          </div>
          {game.chatSignals?.length ? <div className="rounded-2xl border border-violet-300/15 bg-violet-300/[.05] p-4"><div className="text-xs font-black uppercase tracking-[.16em] text-violet-200">Passive input</div><p className="mt-2 text-sm text-slate-300">{game.chatSignals.join(' · ')}</p></div> : null}
        </div> : null}
        {tab==='Comms Lounge' ? <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-black">Private #{channel} test chat</h2><p className="mt-1 max-w-3xl text-sm text-slate-400">Nothing typed here is posted to Twitch or Discord. It is injected directly into #{channel}'s real Nebula command/chat handlers, so the selected stream overlay reacts as if the input came from that stream.</p></div>{overlayUrl?<a href={overlayUrl} target="_blank" rel="noopener noreferrer" className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-4 py-2 text-xs font-black text-emerald-100 no-underline">Open this stream overlay</a>:null}</div>
          <div className="min-h-[300px] max-h-[52vh] space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-black/35 p-3">
            {loungeLog.length ? loungeLog.map((item)=><div key={item.id} className="rounded-xl border border-white/8 bg-white/[.03] p-3"><div className="text-xs font-black text-cyan-200">You → #{channel} <span className="ml-2 font-normal uppercase text-slate-600">{item.mode}</span></div><div className="mt-1 text-sm text-white">{item.message}</div><div className="mt-2 text-xs text-slate-400">{item.reply}</div></div>) : <div className="grid min-h-[260px] place-items-center text-center text-sm text-slate-500">Send a real Nebula command such as <code>spmt D12Y</code>, or ordinary game chat for Word Chain, Phrase Guess, Chat Wars, and other chat-reactive games.</div>}
          </div>
          <form onSubmit={submitLounge} className="flex gap-2"><input value={loungeMessage} onChange={e=>setLoungeMessage(e.target.value)} placeholder={isMosaic?'spmt D12Y or !mosaic owl':'Type private stream game input…'} className="min-w-0 flex-1 rounded-2xl border border-cyan-300/20 bg-black/50 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60"/><button disabled={busy||!loungeMessage.trim()} className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-40">Send privately</button></form>
          <p className="text-xs text-slate-500">Scoped to #{channel}. No Twitch message, no Discord message, no public chat spam.</p>
        </div> : null}
      </section>
      {tab !== 'Quackdex' ? <aside className="space-y-3">
        <StellaControllerGuide game={game} channel={channel} canManage={canManage} onGuide={() => setTab('Guide')} onShare={() => setTab('Share')}>
          <form onSubmit={submit} className="mt-4 space-y-2"><label htmlFor="stella-command" className="block text-sm font-bold text-cyan-100">Type a game command</label><input id="stella-command" value={command} onChange={event => setCommand(event.target.value)} placeholder={isMosaic ? 'D12Y, show 2, brush 3, reveal…' : 'Type a command…'} className="w-full rounded-xl border border-cyan-300/30 bg-slate-950 p-3 text-base text-white"/><p className="text-xs text-slate-300">With or without <code>spmt</code>. {isMosaic ? (testingFree ? 'Everything in Mosaic is free through October 11: click/touch, all brushes, and 15-second reveal. No points needed.' : 'Single-cell paint and show all are free. Brushes: 100 points per artwork. Reveal: 100 points / 15 seconds.') : ''}</p><button disabled={busy || !command.trim() || !user} className="w-full rounded-xl bg-cyan-300 px-4 py-3 font-black text-slate-950 disabled:opacity-40">{!user ? 'Sign in to play' : busy ? 'Running…' : 'Run command'}</button></form>
          {reply ? <p role="status" className="mt-3 rounded-xl bg-black/25 p-3 text-sm text-cyan-50">{reply}</p> : null}
          {isMosaic ? <a href={`/games/pixelbattle/controller/controls?channel=${encodeURIComponent(channel)}`} className="mt-3 block text-sm font-bold text-violet-200 underline">Click &amp; touch studio · {testingFree ? 'free this week' : '5,000-point unlock'}</a> : null}
        </StellaControllerGuide>
        <div className="rounded-3xl border border-cyan-300/15 bg-cyan-300/[.05] p-4"><div className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">Controller status</div><dl className="mt-3 grid gap-2 text-sm"><div className="flex justify-between gap-2"><dt className="text-slate-500">Channel</dt><dd>#{channel||'—'}</dd></div>{isMosaic?<><div className="flex justify-between gap-2"><dt className="text-slate-500">Queue</dt><dd>{mosaic.queueLength}</dd></div><div className="flex justify-between gap-2"><dt className="text-slate-500">Palette</dt><dd className="capitalize">{mosaic.artwork?.paletteId||'classic'}</dd></div></>:null}</dl></div>
        {isMosaic ? <div className="rounded-3xl border border-violet-300/15 bg-violet-300/[.05] p-4"><div className="text-xs font-black uppercase tracking-[.18em] text-violet-200">Project features</div><p className="mt-2 text-xs text-slate-400">{premium?.testingFree!==false?'Unlocked during testing.':'Entitlements apply.'}</p><div className="mt-3 grid gap-1.5 text-xs text-slate-300"><span>✓ Solo projects</span><span>✓ Saved projects</span><span>✓ Friend sessions</span><span>✓ Palette remix</span></div></div> : null}
      </aside> : null}
    </main>
  </div>;
}


