const ts=require('typescript'),fs=require('fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const path=require('node:path');
const src=Object.fromEntries(['src/app/api/game-hub/command/route.ts','src/lib/game-hub-commands.ts'].map(p=>[p,fs.readFileSync(path.join(__dirname,'..',p),'utf8')]));
function mod(path,req){const m={exports:{}};vm.runInNewContext(ts.transpileModule(src[path],{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:m.exports,module:m,require:req,URLSearchParams,console,process,Buffer,Date,setTimeout});return m.exports;}
const commands=mod('src/lib/game-hub-commands.ts',()=>({}));
let active=['pixelbattle'],writes=[],queued=0;
const game=id=>({id,name:id==='pixelbattle'?'Mosaic':id,commands:[]});
const state={};
const post=mod('src/app/api/game-hub/command/route.ts',id=>{
 if(id==='next/server')return {NextResponse:{json:(body,init)=>({body,status:init?.status||200})}};
 if(id==='@/lib/chat-tag-checkin')return {runChatTagCheckin:async(s,input)=>({handled:true,reply:'Space Mountain check-in in #'+input.channel})};
 if(id==='@/lib/auth')return {isBotRequest:()=>true,isStreamWeaverGameHubRequest:()=>false};
 if(id==='@/lib/game-hub-commands')return commands;
 if(id==='@/lib/public-origin')return {getPublicAppOrigin:()=> 'https://chat-tag-new.fly.dev'};
 if(id==='@/lib/game-hub-state')return {normalizeGameHubChannel:v=>String(v||'').trim().toLowerCase().replace(/^#/,''),resolveChannelGameIds:()=>active,normalizeGameHubPlayerId:()=> 'user_1',getGameHubStore:()=>({players:{}}),getChannelGameSettings:()=>({}),setChannelGameRunning:(s,c,id,on)=>{writes.push({id,on});active=on?[id]:[];},resolveGameHubPlayerFocus:()=> 'pixelbattle',rememberGameHubPlayerFocus:()=>{}};
 if(id==='@/lib/volume-store')return {readAppState:async()=>state,updateAppState:async fn=>fn(state)};
 if(id==='@/lib/nebula-mosaic')return {mosaicPublicSnapshot:()=>({artwork:{status:'active'}}),parseMosaicPaintCommand:()=>null,parseMosaicBrushCommand:()=>null,parseMosaicViewCommand:()=>null,parseMosaicRevealCommand:()=>false,validateMosaicTheme:v=>v,MOSAIC_XP_COST:0,resumeMosaicIfNeeded:()=>{},queueMosaicTheme:()=>{queued++;return {position:1}}};
 if(id==='@/lib/game-hub-event-bus')return {getNebulaChatEvents:()=>[]};
 if(id==='@/lib/nebula-rotation')return {nebulaRotationIndexAt:()=>0};
 if(id==='@/lib/dancing-parade')return {getDancingParadeSnapshot:()=>({active:false})};
 if(id==='@/lib/game-hub-registry')return {getGameHubGame:game};
 if(id==='@/lib/game-hub-chat-summary')return {compactGameSnapshot:x=>x,getGamesPointsStanding:()=>null,allPlayedGameIds:()=>[],getPlayerGameSnapshots:()=>[],fitCompactReplyWithLink:(msg,a,url)=>msg+' '+url};
 if(id==='@/lib/game-hub-runtime')return {recordGameHubRuntimeAction:()=>{}};
 return new Proxy({}, {get:()=>()=>{}});
}).POST;
require('node:test')('system commands bypass focused Mosaic themes and stop the game', async()=>{
 const req=message=>({json:async()=>({message,channel:'spacemountainlive',username:'mtman1987',userId:'1',displayName:'M.T.',isAdmin:true})});
 const lead=await post(req('spmt leader'));assert.match(lead.body.reply,/Nebula Arcade profile/);assert.equal(queued,0);
 const dex=await post(req('spmt quackdex'));assert.match(dex.body.launchUrl,/\/quackdex\?/);assert.match(dex.body.launchUrl,/tab=Quackdex/);assert.equal(queued,0);
 for(const text of ['spmt stop','spmt stop mosaic','spmt mosaic stop']){active=['pixelbattle'];writes=[];const res=await post(req(text));assert.equal(queued,0);assert.ok(writes.some(x=>x.id==='pixelbattle'&&!x.on));assert.deepEqual(active,[]);}
 active=['pixelbattle'];for(const text of ['spmt rank','spmt commands','spmt say','spmt raffle','spmt checkin']){await post(req(text));assert.equal(queued,0);}
 const checkin=await post(req('spmt checkin'));assert.equal(checkin.body.handled,true);assert.match(checkin.body.reply,/Space Mountain check-in in #spacemountainlive/);assert.equal(queued,0);
 const owl=await post(req('spmt owl'));assert.equal(queued,1);assert.equal(owl.body.mosaicGenerationQueued,true);
});


