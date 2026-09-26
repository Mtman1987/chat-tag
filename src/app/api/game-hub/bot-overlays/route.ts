import { NextRequest, NextResponse } from 'next/server';
import { isBotRequest } from '@/lib/auth';
import { readAppState, updateAppState } from '@/lib/volume-store';
import { createGameOverlayProfile, normalizeGameOverlayProfile, patchGameOverlayProfile } from '@/lib/game-hub-overlays';

export const dynamic = 'force-dynamic';
const STORE_KEY = 'gameHubOverlayProfiles';
function login(v: unknown){ return String(v||'').trim().toLowerCase().replace(/^#/,'').slice(0,80); }
function store(state:any){ state.gameSettings.default ||= {}; state.gameSettings.default[STORE_KEY] ||= {}; return state.gameSettings.default[STORE_KEY] as Record<string,any>; }

export async function GET(req: NextRequest) {
  if (!isBotRequest(req)) return NextResponse.json({error:'Bot service authentication required.'},{status:401});
  const ownerLogin=login(req.nextUrl.searchParams.get('channel'));
  if(!ownerLogin) return NextResponse.json({error:'channel is required'},{status:400});
  const state=await readAppState();
  const profiles=Object.values(store(state)).map(normalizeGameOverlayProfile).filter((p:any)=>p?.ownerLogin===ownerLogin);
  return NextResponse.json({profiles});
}
export async function POST(req: NextRequest) {
  if (!isBotRequest(req)) return NextResponse.json({error:'Bot service authentication required.'},{status:401});
  const body=await req.json().catch(()=>({}));
  const ownerLogin=login(body.channel);
  if(!ownerLogin) return NextResponse.json({error:'channel is required'},{status:400});
  const profile=await updateAppState((state:any)=>{
    const profiles=store(state);
    const created=createGameOverlayProfile('twitch-channel:'+ownerLogin,{name:body.name,gameIds:body.gameIds,layout:body.layout,transparent:body.transparent,ownerLogin});
    created.ownerLogin=ownerLogin; profiles[created.id]=created; return created;
  });
  return NextResponse.json({profile},{status:201});
}
export async function PATCH(req: NextRequest) {
  if (!isBotRequest(req)) return NextResponse.json({error:'Bot service authentication required.'},{status:401});
  const body=await req.json().catch(()=>({})); const ownerLogin=login(body.channel); const id=String(body.id||'').trim();
  if(!ownerLogin||!id) return NextResponse.json({error:'channel and id are required'},{status:400});
  try {
    const profile=await updateAppState((state:any)=>{
      const profiles=store(state); const existing=normalizeGameOverlayProfile(profiles[id]);
      if(!existing||existing.ownerLogin!==ownerLogin) throw new Error('Overlay was not found.');
      const updated=patchGameOverlayProfile(existing,body); updated.ownerLogin=ownerLogin; profiles[id]=updated; return updated;
    });
    return NextResponse.json({profile});
  } catch(error:any){ return NextResponse.json({error:error?.message||'Unable to update overlay.'},{status:404}); }
}
