import { NextRequest, NextResponse } from 'next/server';
import { workspaceThemeTokens } from '@spmt/sdk';
import { createHash } from 'node:crypto';

const SPMT_BASE_URL = String(process.env.SPMT_BASE_URL || 'https://spmt.live').replace(/\/$/, '');
const CHAT_TAG_SPMT_COOKIE = 'chat_tag_spmt_session';

export const dynamic = 'force-dynamic';

type SurfaceDefinition = { id?: string; path?: string; url?: string };

function surfaceList(payload: unknown): SurfaceDefinition[] {
  if (Array.isArray(payload)) return payload as SurfaceDefinition[];
  if (payload && typeof payload === 'object' && Array.isArray((payload as { surfaces?: unknown[] }).surfaces)) {
    return (payload as { surfaces: SurfaceDefinition[] }).surfaces;
  }
  return [];
}

function surfaceUrls(payload: unknown) {
  const surfaces = surfaceList(payload);
  const build = (id: string, mode: 'panel' | 'full') => {
    const surface = surfaces.find((item) => item?.id === id);
    const raw = String(surface?.url || surface?.path || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, SPMT_BASE_URL);
      url.searchParams.set('app', 'chat-tag');
      url.searchParams.set('mode', mode);
      if (id === 'overlays') url.searchParams.set('output', 'personal');
      return url.toString();
    } catch {
      return '';
    }
  };
  return {
    worktray: build('worktray', 'panel'),
    overlays: build('overlays', 'full'),
    settings: build('settings', 'full'),
  };
}

type ThemeResult = { status: number; body: Record<string, any> };
const cache = new Map<string, { at: number; result: ThemeResult }>();
const pending = new Map<string, Promise<ThemeResult>>();
const FRESH_MS = 15_000, STALE_MS = 5 * 60_000;
let lastWarningAt = 0;

async function upstream(path: string, token: string) {
  // Only GETs are retried. A socket reset must not escape as an unhandled 500.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(`${SPMT_BASE_URL}${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        cache: 'no-store', signal: AbortSignal.timeout(2500),
      });
      const body = await response.json().catch(() => null);
      if (response.status >= 500 && attempt === 0) continue;
      return { status: response.status, ok: response.ok, body };
    } catch {
      if (attempt === 1) return { status: 503, ok: false, body: null };
    }
  }
  return { status: 503, ok: false, body: null };
}

async function loadTheme(token: string, key: string): Promise<ThemeResult> {
  const [profile, personal, surfaces] = await Promise.all([
    upstream('/api/workspace-profile', token),
    upstream('/api/personal-overlay-launch', token),
    upstream('/api/platform/surfaces', token),
  ]);
  if (profile.status === 401 || profile.status === 403) {
    cache.delete(key);
    return { status: profile.status, body: { error: 'Workspace authentication expired. Please sign in again.' } };
  }
  if (!profile.ok || !profile.body?.profile) {
    if (Date.now() - lastWarningAt > 60_000) {
      lastWarningAt = Date.now();
      console.warn(`[WorkspaceTheme] Profile temporarily unavailable (${profile.status}); using a session fallback when available.`);
    }
    const previous = cache.get(key);
    if (profile.status >= 500 && previous && Date.now() - previous.at < STALE_MS) {
      return { status: 200, body: { ...previous.result.body, stale: true } };
    }
    return { status: profile.status >= 500 ? 503 : 502, body: { error: 'Workspace theme temporarily unavailable. Your current theme is unchanged.' } };
  }
  const tenant = personal.ok ? String(personal.body?.tenant || '').trim().toLowerCase() : '';
  const personalCanonical = personal.ok && typeof personal.body?.canonicalUrl === 'string'
    ? personal.body.canonicalUrl
    : (tenant ? `${SPMT_BASE_URL}/tenant/${encodeURIComponent(tenant)}/personal` : null);
  let tokens;
  try { tokens = workspaceThemeTokens(profile.body.profile, 'chat-tag', null); }
  catch { return { status: 502, body: { error: 'Workspace theme response was invalid.' } }; }
  const result = { status: 200, body: {
    tokens, tenant: tenant || null,
    tenantOutputs: tenant ? { public: `${SPMT_BASE_URL}/tenant/${encodeURIComponent(tenant)}/public`, personal: personalCanonical } : null,
    personalOverlayUrl: personal.ok && typeof personal.body?.url === 'string' ? personal.body.url : null,
    surfaceUrls: surfaces.ok ? surfaceUrls(surfaces.body) : { worktray: '', overlays: '', settings: '' },
    revision: profile.body.profile.revision, updatedAt: profile.body.profile.updatedAt,
    partial: !personal.ok || !surfaces.ok,
  } };
  // Bounded, in-memory and keyed by a token digest: never shared across users.
  for (const [id, entry] of cache) if (Date.now() - entry.at >= STALE_MS) cache.delete(id);
  if (cache.size >= 128) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), result });
  return result;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(CHAT_TAG_SPMT_COOKIE)?.value || '';
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401, headers });
  const key = createHash('sha256').update(token).digest('hex');
  const cached = cache.get(key);
  let result = cached && Date.now() - cached.at < FRESH_MS ? cached.result : null;
  if (!result) {
    let work = pending.get(key);
    if (!work) {
      if (pending.size >= 128) return NextResponse.json({ error: 'Workspace theme is busy. Please retry.' }, { status: 503, headers });
      work = loadTheme(token, key).finally(() => pending.delete(key));
      pending.set(key, work);
    }
    result = await work;
  }
  return NextResponse.json(result.body, { status: result.status, headers: { ...headers, ...(result.status === 503 ? { 'Retry-After': '15' } : {}) } });
}
