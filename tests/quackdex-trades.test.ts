import assert from 'node:assert/strict';
import test from 'node:test';
import { offerQuackverseTrade, resolveQuackverseTrade, spareQuackverseCopies, type QuackverseTradeOffer } from '../src/lib/quackverse-trades';
import { normalizeQuackverseCollection, normalizeQuackverseState } from '../src/lib/quackverse-state';
function fixture(){
 const collections={a:normalizeQuackverseCollection({cards:[1,1],deck:[1]}),b:normalizeQuackverseCollection({cards:[2,2],deck:[2]})};
 const offer:QuackverseTradeOffer={id:'trade',fromId:'a',toId:'b',fromName:'Alice',toName:'Bob',giveCardId:1,wantCardId:2,status:'pending',createdAt:new Date(0).toISOString(),expiresAt:new Date(10000).toISOString()};
 return {collections,offer};
}
test('creating an offer does not move cards; only the recipient can accept',()=>{
 const {collections,offer}=fixture();offerQuackverseTrade(collections,offer,0);
 assert.deepEqual(collections.a.cards,[1,1]);assert.deepEqual(collections.b.cards,[2,2]);
 assert.throws(()=>resolveQuackverseTrade(collections,'trade','a','accept',1));
 assert.throws(()=>resolveQuackverseTrade(collections,'trade','stranger','accept',1));
 resolveQuackverseTrade(collections,'trade','b','accept',1);
 assert.deepEqual(collections.a.cards,[1,2]);assert.deepEqual(collections.b.cards,[2,1]);
 assert.deepEqual(collections.a.deck,[1]);assert.deepEqual(collections.b.deck,[2]);
 assert.throws(()=>resolveQuackverseTrade(collections,'trade','b','accept',2));
});
test('saved deck copies remain protected',()=>{
 const {collections}=fixture();
 collections.a.savedDecks=[{id:'saved',name:'Saved',cardIds:[1,1],wins:0,losses:0,createdAt:'',updatedAt:''}];
 assert.equal(spareQuackverseCopies(collections.a,1),0);
});
test('a competing accepted offer cannot spend the same spare card again',()=>{
 const {collections,offer}=fixture();offerQuackverseTrade(collections,offer,0);
 offerQuackverseTrade(collections,{...offer,id:'second'},0);
 resolveQuackverseTrade(collections,'trade','b','accept',1);
 const before=structuredClone(collections);
 assert.throws(()=>resolveQuackverseTrade(collections,'second','b','accept',2));
 assert.deepEqual(collections,before);
});
test('expired offers, missing cards, and third-party cancellation cannot transfer cards',()=>{
 const {collections,offer}=fixture();offerQuackverseTrade(collections,offer,0);
 assert.throws(()=>resolveQuackverseTrade(collections,'trade','b','accept',10000));
 assert.throws(()=>resolveQuackverseTrade(collections,'trade','b','cancel',1));
 collections.b.cards=[2];
 assert.throws(()=>resolveQuackverseTrade(collections,'trade','b','accept',1));
 assert.deepEqual(collections.a.cards,[1,1]);
});
test('declining or cancelling offers preserves both inventories',()=>{
 for(const [actor,action] of [['a','cancel'],['b','decline']] as const){
 const {collections,offer}=fixture();offerQuackverseTrade(collections,offer,0);
 resolveQuackverseTrade(collections,'trade',actor,action,1);
 assert.deepEqual(collections.a.cards,[1,1]);assert.deepEqual(collections.b.cards,[2,2]);
 }
});
test('normalization preserves offers alongside owned cards across pack and state updates',()=>{
 const {collections,offer}=fixture();offerQuackverseTrade(collections,offer,0);
 const state=normalizeQuackverseState({collections});
 assert.equal(state.collections.a.tradeOffers?.[0].id,'trade');
 assert.deepEqual(state.collections.a.cards,[1,1]);
});
