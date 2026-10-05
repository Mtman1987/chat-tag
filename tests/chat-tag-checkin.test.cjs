const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/lib/chat-tag-checkin.ts'), 'utf8');
let request, response = { ok: true, status: 200, json: async () => ({ ok: true, reply: 'Riders: 2', payload: { frontSeat: 'alice' } }) };
const moduleRef = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {
  module: moduleRef, exports: moduleRef.exports, process, Date, Map, console, AbortSignal,
  require: id => id === 'node:crypto' ? { randomUUID: () => 'generated-id' } : { getStreamweaverSecret: () => 'test-service-credential' },
  fetch: async (url, options) => { request = { url, ...options, body: JSON.parse(options.body) }; return response; },
});
const { checkinChatters, runChatTagCheckin } = moduleRef.exports;
test('Chat Tag check-in includes recent channel players, actor, and broadcaster; excludes stale/other channel activity', () => {
  const state = {tagPlayers:{
    a:{id:'user_1',twitchUsername:'alice',lastSeenChannel:'host',lastChatAt:99999},
    b:{id:'2',twitchUsername:'bob',lastSeenChannel:'other',lastChatAt:99999},
    c:{id:'3',twitchUsername:'stale',lastSeenChannel:'host',lastChatAt:1},
    h:{id:'4',twitchUsername:'host'},
  }};
  const result = checkinChatters(state, 'host', 'actor', '5', 'Actor', 400000);
  assert.deepEqual(Array.from(result, x => x.login).sort(), ['actor','host']);
  state.tagPlayers.a.lastChatAt = 399999;
  assert.deepEqual(Array.from(checkinChatters(state, 'host', 'actor', '5', 'Actor', 400000), x => x.login).sort(), ['actor','alice','host']);
});
test('Chat Tag sends scoped rider candidates and delivers returned greeting/overlay with no per-channel OAuth', async () => {
  const result = await runChatTagCheckin({tagPlayers:{}}, {channel:'player_channel',username:'alice',userId:'1',displayName:'Alice',messageId:'twitch-message'});
  assert.equal(request.body.channel, 'player_channel');
  assert.equal(request.body.requestId, 'twitch-message');
  assert.equal(request.body.chatters[0].login, 'alice');
  assert.equal(result.handled, true);
  assert.equal(result.reply, 'Riders: 2');
  assert.equal(result.overlayEvent.payload.checkin.frontSeat, 'alice');
});
test('duplicate check-in receipts produce no repeated chat or overlay announcement', async () => {
  response = {ok:true,status:200,json:async()=>({reply:'Already handled',duplicate:true,payload:{frontSeat:'alice'}})};
  const result = await runChatTagCheckin({tagPlayers:{}}, {channel:'host',username:'alice',userId:'1',displayName:'Alice'});
  assert.equal(result.handled,true);assert.equal(result.reply,'');assert.equal(result.overlayEvent,undefined);
});
test('service errors produce a visible chat reply rather than fall through to Mosaic', async () => {
  response = {ok:false,status:503,json:async()=>({error:'Unavailable'})};
  const result = await runChatTagCheckin({tagPlayers:{}}, {channel:'host',username:'alice',userId:'1',displayName:'Alice'});
  assert.equal(result.handled,true);assert.match(result.reply,/unavailable/);
});
