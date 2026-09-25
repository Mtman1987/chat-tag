'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useLiveStreamers } from '@/contexts/live-streamers-context';
import { useSession } from '@/contexts/session-context';

function norm(value:unknown){return String(value||'').trim().toLowerCase().replace(/^#/,'');}

export function MosaicPlayerController(){
  const {user}=useSession();
  const {liveStreamers}=useLiveStreamers();
  const [channel,setChannel]=useState('');
  const [selected,setSelected]=useState('');
  const [command,setCommand]=useState('');
  const [reply,setReply]=useState('');
  const [snapshot,setSnapshot]=useState<any>(null);

  useEffect(()=>{
    if(!channel)return;
    let dead=false;
    const load=async()=>{
      const res=await fetch(`/api/game-hub/mosaic?channel=${encodeURIComponent(channel)}`,{cache:'no-store'}).catch(()=>null);
      if(res?.ok&&!dead)setSnapshot(await res.json());
    };
    void load();
    const timer=window.setInterval(load,1200);
    return()=>{dead=true;window.clearInterval(timer)};
  },[channel]);

  async function submit(event:FormEvent){
    event.preventDefault();
    if(!channel||!command.trim())return;
    const res=await fetch('/api/game-hub/mosaic-player',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel,message:command.trim()})});
    const body=await res.json().catch(()=>({}));
    setReply(String(body.reply||body.error||'Done.'));
    if(res.ok)setCommand('');
  }

  if(!user)return <div className="p-8 text-center text-slate-300">Sign in with SPMT to use the Mosaic player controller.</div>;

  const art=snapshot?.artwork;
  return <main className="min-h-screen bg-slate-950 p-4 text-white">
    <div className="mx-auto max-w-6xl space-y-4">
      <section className="rounded-3xl border border-emerald-300/15 bg-emerald-300/[.05] p-4">
        <div className="text-xs font-black uppercase tracking-[.18em] text-emerald-200">Mosaic stream target</div>
        <div className="mt-3 flex gap-2">
          <select value={selected} onChange={(e)=>setSelected(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 py-2">
            <option value="">Choose a live streamer...</option>
            {liveStreamers.map((item)=><option key={item.id} value={item.username}>● {item.username}</option>)}
          </select>
          <button type="button" onClick={()=>setChannel(norm(selected))} disabled={!norm(selected)} className="rounded-xl bg-emerald-300 px-5 py-2 font-black text-slate-950 disabled:opacity-40">Set</button>
        </div>
        <p className="mt-2 text-xs text-slate-400">{channel?`Connected to #${channel} as @${norm(user.twitchUsername)}`:'Choose the stream you are watching.'}</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-3xl border border-white/10 bg-white/[.025] p-4">
          {!art?<div className="grid min-h-[420px] place-items-center text-slate-500">No active Mosaic on this stream.</div>:<div><h1 className="text-2xl font-black">{art.theme}</h1><p className="mt-1 text-xs text-slate-400">{art.progress}/{art.total} correct · board {art.activeBoard}</p></div>}
        </section>
        <aside className="space-y-3">
          <form onSubmit={submit} className="rounded-3xl border border-cyan-300/15 bg-cyan-300/[.05] p-4">
            <div className="text-xs font-black uppercase tracking-[.18em] text-cyan-200">Private Mosaic input</div>
            <p className="mt-1 text-xs text-slate-400">Player-safe actions only. Nothing is posted to Twitch chat.</p>
            <input value={command} onChange={(e)=>setCommand(e.target.value)} placeholder="spmt D12Y" className="mt-3 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-3"/>
            <button disabled={!channel||!command.trim()} className="mt-2 w-full rounded-xl bg-cyan-300 px-4 py-2.5 font-black text-slate-950 disabled:opacity-40">Play</button>
            {reply?<p className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-slate-300">{reply}</p>:null}
          </form>
          <div className="grid grid-cols-2 gap-2">{['spmt brush 1','spmt brush 3 right','spmt brush 3 left','spmt brush 3 down','spmt brush 3 up'].map((value)=><button type="button" key={value} onClick={()=>setCommand(value)} className="rounded-xl border border-white/10 bg-white/[.03] px-3 py-2 text-left text-xs font-bold">{value}</button>)}</div>
        </aside>
      </div>
    </div>
  </main>;
}
