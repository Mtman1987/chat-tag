const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const projects=require('../src/lib/mosaic-projects.ts'),mosaic=require('../src/lib/nebula-mosaic.ts'),engine=require('../src/lib/game-hub-state.ts');
function harness(){let state={gameSettings:{default:{}}},owner='tenant1';const art=projects.startMosaicProject(state,'tenant1',{format:'nebula-mosaic',version:1,width:40,height:50,theme:'Flowers',paletteId:'classic',target:Array(2000).fill('Y')});
const response=(body,options={})=>({body,status:options.status||200,headers:options.headers});const module={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/game-hub/mosaic/projects/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,Buffer,console,require:id=>{
if(id==='next/server')return{NextResponse:Object.assign(function(body,options){return response(body,options);},{json:response})};
if(id==='sharp')return {default:require('sharp')};
if(id==='@/lib/controller-access')return{controllerAccess:(_,input)=>!owner?{ok:false,status:401,error:'Sign in'}:input.channel!==owner?{ok:false,status:403,error:'Owner required'}:{ok:true,channel:owner}};
if(id==='@/lib/volume-store')return{readAppState:async()=>state,updateAppState:async fn=>{const draft=structuredClone(state);const result=fn(draft);state=draft;return result;}};
if(id==='@/lib/mosaic-projects')return projects;return{};
}});
return{route:module.exports,state:()=>state,art,owner:value=>owner=value,req:(body={},query='')=>({nextUrl:new URL('https://test.local/api/game-hub/mosaic/projects?'+query),text:async()=>JSON.stringify(body)})};}
test('project routes reject anonymous/cross-tenant writes and private downloads; public gallery is opt-in',async()=>{const h=harness();let r=await h.route.GET(h.req({},'channel=tenant2'));assert.equal(r.body.own.length,0);assert.equal(r.body.gallery.length,0);
h.owner(null);assert.equal((await h.route.POST(h.req({channel:'tenant1',action:'publish',artworkId:h.art.id}))).status,401);assert.equal((await h.route.GET(h.req({},'channel=tenant1&format=json'))).status,401);
h.owner('tenant2');assert.equal((await h.route.POST(h.req({channel:'tenant1',action:'publish',artworkId:h.art.id}))).status,403);
h.owner('tenant1');const published=await h.route.POST(h.req({channel:'tenant1',action:'publish',artworkId:h.art.id}));const shared=published.body.result.id;
h.owner('tenant2');const started=await h.route.POST(h.req({channel:'tenant2',action:'start',shared}));assert.equal(started.status,200);assert.equal(mosaic.getMosaicChannelState(h.state(),'tenant2').current.painted.every(x=>x===''),true);
h.owner(null);assert.equal((await h.route.GET(h.req({},'shared='+shared+'&format=json'))).status,200);
h.owner('tenant1');await h.route.POST(h.req({channel:'tenant1',action:'unpublish',artworkId:h.art.id}));h.owner(null);assert.equal((await h.route.GET(h.req({},'shared='+shared))).status,404);
});
test('lifecycle runner advances queued paintings without a browser and respects manual stop and Discord completion delivery',async()=>{
 let state={gameSettings:{default:{}},discordWebhooks:{}};const first=projects.startMosaicProject(state,'tenant1',{format:'nebula-mosaic',version:1,width:40,height:50,theme:'Flowers',paletteId:'classic',target:Array(2000).fill('Y')});mosaic.finishMosaicForPreview(state,'tenant1');mosaic.queueMosaicTheme(state,{channel:'tenant1',username:'tenant1',userId:'7',theme:'Alien'});
 const module={exports:{}};let generated=0;
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/nebula-mosaic-runner.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,Date,Promise,structuredClone,require:id=>{
 if(id==='@/lib/nebula-mosaic')return mosaic;if(id==='@/lib/game-hub-state')return engine;if(id==='@/lib/nebula-mosaic-generation')return{generateMosaicTemplate:async()=>{generated++;return{target:Array(2000).fill('R')};}};
 if(id==='@/lib/spmt-client')return{awardSpmtXp:async()=>{}};if(id==='@/lib/volume-store')return{readAppState:async()=>state,updateAppState:async fn=>fn(state)};return{};
 }});
 const runner=module.exports;
 state.discordWebhooks['nebula-game:tenant1:pixelbattle']={};await runner.advanceQueuedMosaics();assert.equal(generated,0);
 state.discordWebhooks['nebula-game:tenant1:pixelbattle'].lastCompletedArtworkId=first.id;await runner.advanceQueuedMosaics();assert.equal(generated,1);assert.equal(mosaic.getMosaicChannelState(state,'tenant1').current.theme,'Alien');
 mosaic.finishMosaicForPreview(state,'tenant1');mosaic.queueMosaicTheme(state,{channel:'tenant1',username:'tenant1',userId:'7',theme:'Owl'});engine.setChannelGameRunning(state,'tenant1','pixelbattle',false);await runner.advanceQueuedMosaics();assert.equal(generated,1);
});
test('a failed provider request falls back and every network request has a deadline',async()=>{
 const module={exports:{}};const calls=[];
 const sharp=()=>{const chain={flatten:()=>chain,resize:()=>chain,removeAlpha:()=>chain,raw:()=>chain,toBuffer:async()=>({data:Buffer.alloc(6000),info:{width:40,height:50,channels:3}})};return chain;};sharp.kernel={lanczos3:'lanczos3'};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/nebula-mosaic-generation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module,exports:module.exports,Buffer,AbortSignal,URL,process:{env:{}},console:{warn:()=>{}},fetch:async(url,options)=>{
 assert.ok(options.signal);if(url.endsWith('/api/ai/image')){const provider=JSON.parse(options.body).providerOverride;calls.push(provider);if(provider==='openai')throw new Error('Network timeout');return{ok:true,json:async()=>({ok:true,images:['https://test.local/flowers.png'],provider})};}
 return{ok:true,arrayBuffer:async()=>new Uint8Array([1]).buffer};
 },require:id=>id==='sharp'?sharp:id==='@/lib/nebula-mosaic'?mosaic:id==='@/lib/runtime-secrets'?{getStreamweaverSecret:()=> 'test'}:{}});
 const result=await module.exports.generateMosaicTemplate('Flowers');assert.deepEqual(calls,['openai','pollinations']);assert.equal(result.target.length,2000);assert.equal(result.provider,'pollinations');
});

test('download returns a real PNG attachment at full painting resolution', async () => {
 const h=harness();
 const r=await h.route.GET(h.req({},'channel=tenant1&artworkId='+encodeURIComponent(h.art.id)+'&format=png'));
 assert.equal(r.status,200);assert.equal(r.headers['Content-Type'],'image/png');assert.match(r.headers['Content-Disposition'],/attachment/);
 const metadata=await require('sharp')(Buffer.from(r.body)).metadata();assert.equal(metadata.width,800);assert.equal(metadata.height,1000);
});

test('public gallery ignores forged identity headers and never includes private projects', async () => {
 const h=harness();
 const r=await h.route.GET(h.req({},'scope=gallery&channel=tenant1'));
 assert.equal(r.body.own.length,0);assert.equal(r.body.canManage,false);
 assert.equal((await h.route.GET(h.req({},'scope=gallery&channel=tenant1&format=json'))).status,401);
});
