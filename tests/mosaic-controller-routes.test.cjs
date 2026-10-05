const ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
const engine=require('../src/lib/game-hub-state.ts'),mosaic=require('../src/lib/nebula-mosaic.ts'),normalizer=require('../src/lib/mosaic-controller-command.ts'),prices=require('../src/lib/mosaic-prices.ts'),commands=require('../src/lib/game-hub-commands.ts'),registry=require('../src/lib/game-hub-registry.ts');
test.beforeEach(t => { t.mock.method(Date, 'now', () => Date.parse('2026-10-12T05:00:00Z')); });
function harness(otherActivity=false){
 let state={gameSettings:{default:{}}}, user={id:'7',twitchUsername:'artist'};
 const player=engine.getOrCreateGameHubPlayer(state,{userId:'7',username:'artist'});engine.awardGameHubPoints(state,player,5500,'fixture');engine.setChannelGameRunning(state,'tenant','pixelbattle',true);
 const queued=mosaic.queueMosaicTheme(state,{channel:'tenant',userId:'7',username:'artist',theme:'owl'});mosaic.installMosaicTemplate(state,'tenant',queued.request.id,Array(2000).fill('Y'));
 if(otherActivity)engine.setChannelGameRunning(state,'tenant','chatwars',true);
 const response=(body,init)=>({body,status:init?.status||200,json:async()=>body});
 class Request {constructor(url,options={}){this.url=url;this.nextUrl=new URL(url);this.headers=new Headers(options.headers);this.body=options.body;} async json(){return JSON.parse(this.body||'{}');}}
 const update=async fn=>{const draft=structuredClone(state);const result=await fn(draft);state=draft;return result;};
 let commandPost;
 function load(file){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,Date,URL,URLSearchParams,console,process,Buffer,setTimeout,structuredClone,require:id=>{
  if(id==='next/server')return{NextRequest:Request,NextResponse:{json:response}};
  if(id==='@/lib/auth')return{getSessionUserFromRequest:()=>user,isBotRequest:()=>true,isStreamWeaverGameHubRequest:()=>false};
  if(id==='@/lib/game-hub-state')return engine;
  if(id==='@/lib/nebula-mosaic')return mosaic;
  if(id==='@/lib/mosaic-prices')return prices;
  if(id==='@/lib/mosaic-controller-command')return normalizer;
  if(id==='@/lib/game-hub-commands')return commands;
  if(id==='@/lib/game-hub-registry')return registry;
  if(id==='@/lib/volume-store')return{readAppState:async()=>state,updateAppState:update};
  if(id==='@/lib/runtime-secrets')return{getBotSecret:()=> 'test'};
  if(id==='@/app/api/game-hub/command/route')return{POST:commandPost};
  if(id==='@/app/api/game-hub/chat/route')return{POST:()=>{throw Error('Visitor command must not fall through into chat');}};
  if(id==='@/lib/game-hub-runtime')return{recordGameHubRuntimeAction:()=>{}};
  if(id==='@/lib/game-hub-event-bus')return{getNebulaChatEvents:()=>otherActivity?[{at:new Date(Date.now()).toISOString(),gameIds:['chatwars']}]:[]};
  if(id==='@/lib/nebula-rotation')return{nebulaRotationIndexAt:()=>0};
  if(id==='@/lib/game-hub-chat-summary')return{fitCompactReplyWithLink:text=>text};
  if(id==='@/lib/public-origin')return{getPublicAppOrigin:()=> 'https://test.local'};
  if(id==='@/lib/dancing-parade')return{getDancingParadeSnapshot:()=>({active:false})};
  return {};
 }});return module.exports;}
 commandPost=load('src/app/api/game-hub/command/route.ts').POST;
 return{load,read:()=>state,user:value=>user=value,request:body=>new Request('https://test.local/api/game-hub/controller-command',{method:'POST',body:JSON.stringify({channel:'tenant',...body})})};
}
test('chat reveal cannot charge while another activity is displayed; the Mosaic controller can preview its visible game',async()=>{
 const h=harness(true),post=h.load('src/app/api/game-hub/command/route.ts').POST;
 const result=await post(h.request({message:'spmt reveal',userId:'7',username:'artist'}));
 assert.match(result.body.reply,/no points were charged/);
 assert.equal(engine.getGameHubStore(h.read()).players['twitch:7'].lifetimeSpent,0);
 const controller=h.load('src/app/api/game-hub/controller-command/route.ts').POST;
 const accepted=await controller(h.request({message:'reveal',gameId:'pixelbattle',commandMode:true}));
 assert.match(accepted.body.reply,/100 Nebula points spent/);
 assert.equal(engine.getGameHubStore(h.read()).players['twitch:7'].lifetimeSpent,100);
});
test('authenticated visitors can type prefixed or bare paint/brush/reveal but cannot manage channels',async()=>{
 const h=harness(),post=h.load('src/app/api/game-hub/controller-command/route.ts').POST;
 for(const message of ['D12Y','spmt E12Y','spmt mosaic brush 3','show all','reveal']){const r=await post(h.request({message,gameId:'pixelbattle',commandMode:true}));assert.equal(r.status,200);assert.equal(r.body.handled,true);assert.doesNotMatch(r.body.reply,/request #|not recognized/);}
 const state=h.read(),store=engine.getGameHubStore(state);
 assert.equal(store.players['twitch:7'].lifetimeSpent,200);assert.equal(mosaic.mosaicPublicSnapshot(state,'tenant').queueLength,0);
 for(const message of ['stop','finish','replay','palette neon','clearqueue','checkin','say hi']){const r=await post(h.request({message,gameId:'pixelbattle',commandMode:true,isAdmin:true,userId:'1'}));assert.equal(r.status,403);}
 assert.equal(mosaic.mosaicPublicSnapshot(h.read(),'tenant').artwork.progress,2);
 h.user(null);assert.equal((await post(h.request({message:'reveal',gameId:'pixelbattle',commandMode:true}))).status,401);
});
test('tap endpoint charges authenticated player, rejects locked/stale/stopped board, and preserves unlock',async()=>{
 const h=harness(),post=h.load('src/app/api/game-hub/mosaic-controls/route.ts').POST;
 const art=()=>mosaic.mosaicPublicSnapshot(h.read(),'tenant').artwork;
 const paint=()=>({action:'paint',coordinate:'A1',color:'Y',board:1,artworkId:art().id});
 assert.equal((await post(h.request(paint()))).status,403);
 let r=await post(h.request({action:'unlock',userId:'victim',cost:0}));assert.equal(r.status,200);assert.equal(r.body.balance,500);
 r=await post(h.request({action:'unlock'}));assert.equal(r.body.balance,500);
 assert.equal((await post(h.request({...paint(),board:2}))).status,409);
 assert.equal(art().progress,0);
 r=await post(h.request(paint()));assert.equal(r.status,200);assert.equal(art().progress,1);assert.equal(r.body.balance,501);assert.equal(r.body.unlocked,true);
 engine.setChannelGameRunning(h.read(),'tenant','pixelbattle',false);
 r=await post(h.request({...paint(),coordinate:'B1'}));assert.equal(r.status,400);assert.equal(art().progress,1);
 h.user(null);assert.equal((await post(h.request({action:'unlock'}))).status,401);
});

test('testing-week API opens tap controls at zero points, keeps identity checks, and reports free reveal', async t => {
 t.mock.method(Date,'now',()=>Date.parse('2026-10-05T19:00:00Z'));
 const h=harness(),route=h.load('src/app/api/game-hub/mosaic-controls/route.ts');
 engine.getGameHubStore(h.read()).players['twitch:7'].gamePointsBalance=0;
 const status=await route.GET(h.request({}));
 assert.equal(status.body.unlocked,true);assert.equal(status.body.controlsCost,0);assert.equal(status.body.permanentlyUnlocked,false);
 const art=mosaic.mosaicPublicSnapshot(h.read(),'tenant').artwork;
 const tap=await route.POST(h.request({action:'paint',coordinate:'A1',color:'Y',board:1,artworkId:art.id,userId:'victim'}));
 assert.equal(tap.status,200);assert.equal(tap.body.unlocked,true);
 const controller=h.load('src/app/api/game-hub/controller-command/route.ts').POST;
 const reveal=await controller(h.request({message:'reveal',gameId:'pixelbattle',commandMode:true}));
 assert.match(reveal.body.reply,/free during testing/);assert.doesNotMatch(reveal.body.reply,/already showing/);
 const duplicate=await controller(h.request({message:'reveal',gameId:'pixelbattle',commandMode:true}));
 assert.match(duplicate.body.reply,/already showing/);
 const player=engine.getGameHubStore(h.read()).players['twitch:7'];
 assert.equal(player.lifetimeSpent,0);assert.equal(player.mosaicControlsUnlockedAt,undefined);
 h.user(null);assert.equal((await route.POST(h.request({action:'unlock'}))).status,401);
});
