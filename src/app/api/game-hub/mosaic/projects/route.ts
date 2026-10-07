import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { controllerAccess } from '@/lib/controller-access';
import { readAppState, updateAppState } from '@/lib/volume-store';
import { findMosaicArtwork, mosaicTemplate, mosaicTemplateSvg, publishMosaic, resumeMosaicProject, sharedMosaicProjects, startMosaicProject } from '@/lib/mosaic-projects';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const state = await readAppState();
  const params = req.nextUrl.searchParams;
  const shared = sharedMosaicProjects(state);
  const shareId = params.get('shared');
  const project = shareId ? shared.find(item => item.id === shareId) : null;
  if (shareId && !project) return NextResponse.json({ error: 'This painting is no longer shared.' }, { status: 404 });
  const format = params.get('format');
  if (format) {
    const access = controllerAccess(req, { channel: params.get('channel'), gameId: 'pixelbattle' });
    if (!project && !access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    const art = !project && access.ok ? findMosaicArtwork(state, access.channel, params.get('artworkId')) : null;
    const template = project?.template || (art ? mosaicTemplate(art) : null);
    if (!template) return NextResponse.json({ error: 'Painting not found.' }, { status: 404 });
    if (!['json','png'].includes(format)) return NextResponse.json({ error: 'Choose PNG or JSON.' }, { status: 400 });
    const headers = { 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="nebula-mosaic.${format}"` };
    if (format === 'json') return NextResponse.json(template, { headers });
    const image = await sharp(Buffer.from(mosaicTemplateSvg(template))).png().toBuffer();
    return new NextResponse(new Uint8Array(image), { headers: { ...headers, 'Content-Type': 'image/png' } });
  }
  const access = controllerAccess(req, { channel: params.get('channel'), gameId: 'pixelbattle' });
  const mosaic = access.ok ? state.gameSettings?.default?.gameHub?.channels?.[access.channel]?.mosaic : null;
  const own = [mosaic?.current, ...(mosaic?.saves || [])].filter((art, index, items) => art && items.findIndex(item => item?.id === art.id) === index)
    .map(art => ({ id: art.id, theme: art.theme, status: art.status, sharedId: shared.find(item => item.channel === (access.ok ? access.channel : null) && item.artworkId === art.id)?.id || '' }));
  const publicProject = (item: any) => ({ id: item.id, channel: item.channel, theme: item.template.theme, paletteId: item.template.paletteId, publishedAt: item.publishedAt });
  return NextResponse.json({ own, gallery: shared.sort((a,b) => Number(access.ok && b.channel === access.channel) - Number(access.ok && a.channel === access.channel) || b.publishedAt.localeCompare(a.publishedAt)).slice(0,100).map(publicProject), selected: project ? publicProject(project) : null, canManage: access.ok }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 100_000) return NextResponse.json({ error: 'Project file is too large.' }, { status: 413 });
  let body: any;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid project request.' }, { status: 400 }); }
  const access = controllerAccess(req, { channel: body.channel, gameId: 'pixelbattle' });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const result = await updateAppState(state => {
      if (body.action === 'resume') return resumeMosaicProject(state, access.channel, String(body.artworkId), body.replace === true);
      if (body.action === 'publish' || body.action === 'unpublish') return publishMosaic(state, access.channel, String(body.artworkId || sharedMosaicProjects(state).find(item => item.channel === access.channel && item.id === body.shared)?.artworkId || ''), body.action === 'publish');
      if (body.action === 'start' || body.action === 'import') {
        const project = body.shared ? sharedMosaicProjects(state).find(item => item.id === body.shared) : null;
        const art = body.artworkId ? findMosaicArtwork(state, access.channel, String(body.artworkId)) : null;
        const template = body.action === 'import' ? body.template : project?.template || (art ? mosaicTemplate(art) : null);
        if (!template) throw new Error('Painting not found.');
        return { id: startMosaicProject(state, access.channel, template, body.replace === true).id };
      }
      throw new Error('Choose a valid project action.');
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Project could not be updated.' }, { status: 400 }); }
}
