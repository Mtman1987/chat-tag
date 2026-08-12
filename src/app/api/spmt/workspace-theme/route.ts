import { NextRequest, NextResponse } from 'next/server';
import { workspaceThemeTokens } from '@spmt/sdk';

const SPMT_BASE_URL = String(process.env.SPMT_BASE_URL || 'https://spmt.live').replace(/\/$/, '');
const CHAT_TAG_SPMT_COOKIE = 'chat_tag_spmt_session';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = request.cookies.get(CHAT_TAG_SPMT_COOKIE)?.value || '';
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const [profileResponse, personalResponse] = await Promise.all([
    fetch(`${SPMT_BASE_URL}/api/workspace-profile`, { headers, cache: 'no-store' }),
    fetch(`${SPMT_BASE_URL}/api/personal-overlay-launch`, { headers, cache: 'no-store' }),
  ]);
  const [payload, personalPayload] = await Promise.all([
    profileResponse.json().catch(() => null),
    personalResponse.json().catch(() => null),
  ]);
  if (!profileResponse.ok || !payload?.profile) {
    return NextResponse.json({ error: payload?.error || 'Workspace theme unavailable' }, { status: profileResponse.status || 502 });
  }

  const tenant = personalResponse.ok ? String(personalPayload?.tenant || '').trim().toLowerCase() : '';
  const personalCanonical = personalResponse.ok && typeof personalPayload?.canonicalUrl === 'string'
    ? personalPayload.canonicalUrl
    : (tenant ? `${SPMT_BASE_URL}/tenant/${encodeURIComponent(tenant)}/personal` : null);

  return NextResponse.json({
    tokens: workspaceThemeTokens(payload.profile, 'chat-tag', null),
    tenant: tenant || null,
    tenantOutputs: tenant ? {
      public: `${SPMT_BASE_URL}/tenant/${encodeURIComponent(tenant)}/public`,
      personal: personalCanonical,
    } : null,
    // This launch URL contains the narrow read-only Personal render key in the
    // fragment. SPMT consumes it client-side and removes it from the address bar.
    personalOverlayUrl: personalResponse.ok && typeof personalPayload?.url === 'string' ? personalPayload.url : null,
    revision: payload.profile.revision,
    updatedAt: payload.profile.updatedAt,
  });
}
