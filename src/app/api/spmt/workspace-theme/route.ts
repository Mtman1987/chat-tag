import { NextRequest, NextResponse } from 'next/server';
import { workspaceThemeTokens } from '@spmt/sdk';

const SPMT_BASE_URL = String(process.env.SPMT_BASE_URL || 'https://spmt.live').replace(/\/$/, '');
const CHAT_TAG_SPMT_COOKIE = 'chat_tag_spmt_session';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = request.cookies.get(CHAT_TAG_SPMT_COOKIE)?.value || '';
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const [profileResponse, overlayResponse, tenantResponse] = await Promise.all([
    fetch(`${SPMT_BASE_URL}/api/workspace-profile`, { headers, cache: 'no-store' }),
    fetch(`${SPMT_BASE_URL}/api/overlay-workspace`, { headers, cache: 'no-store' }),
    fetch(`${SPMT_BASE_URL}/api/tenant-scene?output=personal`, { headers, cache: 'no-store' }),
  ]);
  const [payload, overlayPayload, tenantPayload] = await Promise.all([
    profileResponse.json().catch(() => null),
    overlayResponse.json().catch(() => null),
    tenantResponse.json().catch(() => null),
  ]);
  if (!profileResponse.ok || !payload?.profile) {
    return NextResponse.json({ error: payload?.error || 'Workspace theme unavailable' }, { status: profileResponse.status || 502 });
  }

  const tenant = tenantResponse.ok ? String(tenantPayload?.tenant || '') : '';
  return NextResponse.json({
    tokens: workspaceThemeTokens(payload.profile, 'chat-tag', overlayResponse.ok ? overlayPayload?.layout || null : null),
    revision: payload.profile.revision,
    updatedAt: payload.profile.updatedAt,
    tenant: tenant || null,
    tenantOutputs: tenantResponse.ok && tenantPayload?.urls ? tenantPayload.urls : null,
    personalOverlayUrl: tenant ? `/tenant/${encodeURIComponent(tenant)}/personal` : null,
  });
}
