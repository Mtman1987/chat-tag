import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import { normalizeQuackverseUserId, quackverseUserIdFromSession } from '@/lib/quackverse-access';
import { normalizeQuackverseState } from '@/lib/quackverse-state';
import { offerQuackverseTrade, resolveQuackverseTrade, spareQuackverseCopies } from '@/lib/quackverse-trades';
import { quackverseCards } from '@/lib/quackverse-data';
import { readAppState, updateAppState, type AppState } from '@/lib/volume-store';
export const dynamic='force-dynamic';
function playerDirectory(app:AppState) {
 const state=normalizeQuackverseState(app.quackverse);
 const players=new Map<string,{userId:string;username:string;cards:number[]}>();
 for(const [key,record] of [...Object.entries(app.users||{}),...Object.entries(app.tagPlayers||{})]) {
   const userId=normalizeQuackverseUserId(record.id||key);
   const username=String(record.twitchUsername||'').trim().toLowerCase();
   const collection=state.collections[userId];
   if(username&&collection?.cards.length)players.set(userId,{userId,username,cards:collection.cards});
 }
 return [...players.values()].sort((a,b)=>a.username.localeCompare(b.username));
}
export async function GET(req:NextRequest) {
 const session=getSessionUserFromRequest(req),userId=quackverseUserIdFromSession(session);
 if(!userId)return NextResponse.json({error:'Sign in to open your Quackdex.'},{status:401});
 const app=await readAppState(),state=normalizeQuackverseState(app.quackverse);
 const collection=state.collections[userId];
 const offers=Object.values(state.collections).flatMap(c=>c.tradeOffers||[]).filter(t=>t.fromId===userId||t.toId===userId).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,100);
 return NextResponse.json({userId,players:playerDirectory(app),offers,spareCards:collection?[...new Set(collection.cards)].map(cardId=>({cardId,quantity:spareQuackverseCopies(collection,cardId)})):[]},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req:NextRequest) {
 const session=getSessionUserFromRequest(req),userId=quackverseUserIdFromSession(session);
 if(!userId)return NextResponse.json({error:'Sign in to manage trades.'},{status:401});
 const body=await req.json().catch(()=>({}));
 try {
 const offer=await updateAppState(app=>{
   const state=normalizeQuackverseState(app.quackverse);
   let result;
   if(body.action==='offer') {
     const target=playerDirectory(app).find(p=>p.userId===String(body.toId||''));
     if(!target)throw new Error('Choose a player from the Quackdex.');
     const giveCardId=Number(body.giveCardId),wantCardId=Number(body.wantCardId);
     if(!quackverseCards.some(c=>c.id===giveCardId)||!quackverseCards.some(c=>c.id===wantCardId))throw new Error('Choose valid Quackverse cards.');
     const now=Date.now();
     result=offerQuackverseTrade(state.collections,{id:randomUUID(),fromId:userId,toId:target.userId,fromName:session!.twitchUsername,toName:target.username,giveCardId,wantCardId,status:'pending',createdAt:new Date(now).toISOString(),expiresAt:new Date(now+48*60*60*1000).toISOString()},now);
   } else if(body.action==='accept'||body.action==='decline'||body.action==='cancel') {
     result=resolveQuackverseTrade(state.collections,String(body.offerId||''),userId,body.action);
   } else throw new Error('Unknown trade action.');
   state.updatedAt=new Date().toISOString();app.quackverse=state;
   return result;
 });
 return NextResponse.json({offer});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Trade failed.'},{status:400})}
}
