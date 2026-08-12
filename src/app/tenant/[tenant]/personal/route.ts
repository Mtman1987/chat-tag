import { NextRequest, NextResponse } from 'next/server';
import { fetchSpmtForUser, spmtBaseUrl } from '@/lib/spmt-user-proxy';

export const dynamic = 'force-dynamic';

const TRANSPARENT_RETRY = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;background:transparent!important}</style></head><body><script>setTimeout(()=>location.reload(),3000)</script></body></html>`;

function rewriteCanonicalRenderer(html: string) {
  return html
    .replace('/shared/overlay-widget-contract.js', `${spmtBaseUrl()}/shared/overlay-widget-contract.js`)
    .replace('/api/tenant/${encodeURIComponent(tenant)}/${output}', '/api/spmt/personal-render/tenant/${encodeURIComponent(tenant)}/${output}')
    .replace("'/api/cloud-xbox/status'", "'/api/spmt/personal-render/cloud-xbox/status'")
    .replace("'/api/cloud-xbox/frame'", "'/api/spmt/personal-render/cloud-xbox/frame'");
}

export async function GET(request: NextRequest, context: { params: Promise<{ tenant: string }> }) {
  const tenant = String((await context.params).tenant || '').toLowerCase();
  if (!/^[a-z0-9._-]{1,80}$/.test(tenant)) {
    return new NextResponse(TRANSPARENT_RETRY, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }

  const upstream = await fetchSpmtForUser(request, `/tenant/${encodeURIComponent(tenant)}/personal`, {
    method: 'GET',
    headers: { Accept: 'text/html' },
  });
  if (!upstream?.ok) {
    return new NextResponse(TRANSPARENT_RETRY, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store, max-age=0' } });
  }

  return new NextResponse(rewriteCanonicalRenderer(await upstream.text()), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
    },
  });
}
