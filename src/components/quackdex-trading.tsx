'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getAuthHeaders } from '@/lib/client-auth';
import { quackverseCards } from '@/lib/quackverse-data';
import type { QuackverseTradeOffer } from '@/lib/quackverse-trades';
type Player={userId:string;username:string;cards:number[]};
type Data={userId:string;players:Player[];offers:QuackverseTradeOffer[];spareCards:{cardId:number;quantity:number}[]};
const cardName=(id:number)=>quackverseCards.find(c=>c.id===id)?.name||`Card #${id}`;
export function QuackdexTrading({onCollectionChanged}:{onCollectionChanged:()=>Promise<void>}) {
 const [data,setData]=useState<Data|null>(null),[targetId,setTargetId]=useState(''),[give,setGive]=useState(''),[want,setWant]=useState('');
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[search,setSearch]=useState('');
 const acceptedRef=useRef('');
 const refresh=useCallback(async()=>{
  const r=await fetch('/api/quackverse/quackdex',{cache:'no-store',headers:getAuthHeaders()});
  const p=await r.json();if(!r.ok)throw new Error(p.error||'Could not load Quackdex.');setData(p);
  const accepted=p.offers.filter((t:QuackverseTradeOffer)=>t.status==='accepted').map((t:QuackverseTradeOffer)=>t.id).sort().join(',');
  if(accepted!==acceptedRef.current){acceptedRef.current=accepted;await onCollectionChanged();}
 },[onCollectionChanged]);
 useEffect(()=>{let dead=false;const poll=()=>refresh().catch(e=>{if(!dead)setMessage(e.message)});void poll();const timer=setInterval(poll,10000);return()=>{dead=true;clearInterval(timer)}},[refresh]);
 async function act(action:string,offerId?:string) {
  setBusy(true);setMessage('');
  try{
   const r=await fetch('/api/quackverse/quackdex',{method:'POST',headers:{...getAuthHeaders(),'Content-Type':'application/json'},body:JSON.stringify({action,offerId,toId:targetId,giveCardId:Number(give),wantCardId:Number(want)})});
   const p=await r.json();if(!r.ok)throw new Error(p.error||'Trade failed.');
   setMessage(action==='offer'?'Offer sent. Your cards stay with you until the other player accepts.':action==='accept'?'Trade accepted. Both collections are updated.':action==='decline'?'Offer declined.':'Offer cancelled.');
   await refresh();
  }catch(e){setMessage(e instanceof Error?e.message:'Trade failed.')}finally{setBusy(false)}
 }
 const target=data?.players.find(p=>p.userId===targetId);
 const targetCards=target?[...new Set(target.cards)].filter(id=>cardName(id).toLowerCase().includes(search.toLowerCase())):[];
 const spare=data?.spareCards.filter(c=>c.quantity>0)||[];
 return <section className="space-y-4 rounded-lg border border-white/10 bg-black/20 p-4">
  <div><h3 className="font-headline text-lg text-white">Players &amp; Trades</h3><p className="text-sm text-slate-300">Browse another player’s cards, then choose one spare card each. Both players must agree to the trade.</p></div>
  {message&&<p role="status" className="rounded-md bg-cyan-300/10 p-3 text-sm text-cyan-100">{message}</p>}
  <label className="block text-sm text-slate-200">Browse player
   <select aria-label="Browse player" className="mt-1 w-full rounded-md border border-white/20 bg-slate-900 p-2" value={targetId} onChange={e=>{setTargetId(e.target.value);setWant('');setSearch('')}}>
    <option value="">Choose a player</option>{data?.players.filter(p=>p.userId!==data.userId).map(p=><option key={p.userId} value={p.userId}>@{p.username} · {p.cards.length} cards</option>)}
   </select>
  </label>
  {target&&<>
   <input aria-label="Search player cards" placeholder="Search their cards…" value={search} onChange={e=>setSearch(e.target.value)} className="w-full rounded-md border border-white/20 bg-slate-900 p-2 text-white"/>
   <div className="grid max-h-80 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
    {targetCards.map(id=><button key={id} type="button" onClick={()=>setWant(String(id))} className={`rounded-lg border p-2 text-left text-sm ${want===String(id)?'border-cyan-300 bg-cyan-300/10':'border-white/20 bg-slate-900'}`}>
     <img src={`/api/quackverse/pack-preview?ids=${id}&mode=card`} alt={cardName(id)} loading="lazy" className="mb-2 w-full rounded-md"/>
     <span className="block text-white">{cardName(id)}</span><span className="text-slate-300">Owned ×{target.cards.filter(c=>c===id).length}</span>
    </button>)}
    {!targetCards.length&&<p className="text-slate-300">No matching cards.</p>}
   </div>
   <div className="grid gap-3 sm:grid-cols-2">
    <label className="text-sm text-slate-200">You offer<select aria-label="You offer" className="mt-1 w-full rounded-md border border-white/20 bg-slate-900 p-2" value={give} onChange={e=>setGive(e.target.value)}><option value="">Choose your spare card</option>{spare.map(c=><option key={c.cardId} value={c.cardId}>{cardName(c.cardId)} · {c.quantity} spare</option>)}</select></label>
    <label className="text-sm text-slate-200">You request<select aria-label="You request" className="mt-1 w-full rounded-md border border-white/20 bg-slate-900 p-2" value={want} onChange={e=>setWant(e.target.value)}><option value="">Choose their card</option>{[...new Set(target.cards)].map(id=><option key={id} value={id}>{cardName(id)}</option>)}</select></label>
   </div>
   <Button type="button" disabled={busy||!give||!want} onClick={()=>act('offer')}>Offer {give?cardName(Number(give)):'one card'} for {want?cardName(Number(want)):'one card'}</Button>
   <p className="text-xs text-slate-400">Cards needed by an active or saved deck stay protected. Offers expire after 48 hours.</p>
  </>}
  <div className="space-y-3"><h4 className="font-semibold text-white">Your trade offers</h4>
   {!data?.offers.length&&<p className="text-sm text-slate-300">No offers yet. Both players see their offers here.</p>}
   {data?.offers.map(offer=>{
    const incoming=offer.toId===data.userId,pending=offer.status==='pending'&&Date.parse(offer.expiresAt)>Date.now();
    return <div key={offer.id} className="rounded-lg border border-white/15 bg-slate-900 p-3 text-sm text-slate-200">
     <p>@{offer.fromName} offers <strong>{cardName(offer.giveCardId)}</strong> to @{offer.toName} for <strong>{cardName(offer.wantCardId)}</strong>.</p>
     <p className="mt-1 text-xs text-slate-400">{offer.status==='pending'&&!pending?'Expired':offer.status}</p>
     {pending&&<div className="mt-2 flex flex-wrap gap-2">{incoming?<><Button type="button" disabled={busy} onClick={()=>act('accept',offer.id)}>Accept trade</Button><Button type="button" variant="secondary" disabled={busy} onClick={()=>act('decline',offer.id)}>Decline</Button></>:<Button type="button" variant="secondary" disabled={busy} onClick={()=>act('cancel',offer.id)}>Cancel offer</Button>}</div>}
    </div>
   })}
  </div>
 </section>;
}
