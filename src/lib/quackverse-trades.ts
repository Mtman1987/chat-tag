import type { QuackverseCollectionState } from './quackverse-state';
export type QuackverseTradeOffer = {
 id:string;fromId:string;toId:string;fromName:string;toName:string;giveCardId:number;wantCardId:number;
 status:'pending'|'accepted'|'declined'|'cancelled';createdAt:string;expiresAt:string;resolvedAt?:string;
};
export function spareQuackverseCopies(collection:QuackverseCollectionState,cardId:number) {
 const count=(ids:number[])=>ids.filter(id=>id===cardId).length;
 const reserved=Math.max(count(collection.deck),...collection.savedDecks.map(deck=>count(deck.cardIds)),0);
 return Math.max(0,count(collection.cards)-reserved);
}
export function offerQuackverseTrade(collections:Record<string,QuackverseCollectionState>,offer:QuackverseTradeOffer,now=Date.now()) {
 if(offer.fromId===offer.toId)throw new Error('Choose another player.');
 const from=collections[offer.fromId],to=collections[offer.toId];
 if(!from||!to)throw new Error('Both players need a Quackverse collection.');
 if(spareQuackverseCopies(from,offer.giveCardId)<1||spareQuackverseCopies(to,offer.wantCardId)<1)throw new Error('Choose owned cards with a spare copy outside active and saved decks.');
 if((from.tradeOffers||[]).filter(t=>t.status==='pending'&&Date.parse(t.expiresAt)>now).length>=20)throw new Error('You already have 20 open offers. Cancel one first.');
 from.tradeOffers=[...(from.tradeOffers||[]).filter(t=>t.status==='pending'&&Date.parse(t.expiresAt)>now),...(from.tradeOffers||[]).filter(t=>t.status!=='pending').slice(-100),offer];
 return offer;
}
export function resolveQuackverseTrade(collections:Record<string,QuackverseCollectionState>,id:string,actorId:string,action:'accept'|'decline'|'cancel',now=Date.now()) {
 const offer=Object.values(collections).flatMap(c=>c.tradeOffers||[]).find(t=>t.id===id);
 if(!offer)throw new Error('Trade offer not found.');
 if(offer.status!=='pending')throw new Error('This offer has already been resolved.');
 if(Date.parse(offer.expiresAt)<=now)throw new Error('This offer expired. Create a new offer.');
 if(action==='cancel'?actorId!==offer.fromId:actorId!==offer.toId)throw new Error('This trade action belongs to the other player.');
 if(action==='accept') {
   const from=collections[offer.fromId],to=collections[offer.toId];
   if(!from||!to||spareQuackverseCopies(from,offer.giveCardId)<1||spareQuackverseCopies(to,offer.wantCardId)<1)throw new Error('A card is no longer available outside the players’ decks. Cancel this offer and choose another card.');
   // Both collections and this offer are committed in one locked Quackverse shard update.
   from.cards.splice(from.cards.indexOf(offer.giveCardId),1);
   to.cards.splice(to.cards.indexOf(offer.wantCardId),1);
   from.cards.push(offer.wantCardId);to.cards.push(offer.giveCardId);
 }
 offer.status=action==='accept'?'accepted':action==='decline'?'declined':'cancelled';
 offer.resolvedAt=new Date(now).toISOString();
 return offer;
}
