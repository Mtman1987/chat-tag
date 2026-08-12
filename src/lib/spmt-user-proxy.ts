import { NextRequest } from 'next/server';

const SPMT_BASE_URL = String(process.env.SPMT_BASE_URL || 'https://spmt.live').replace(/\/$/, '');
const CHAT_TAG_SPMT_COOKIE = 'chat_tag_spmt_session';

export async function fetchSpmtForUser(request: NextRequest, path: string, init: RequestInit = {}) {
  const token = request.cookies.get(CHAT_TAG_SPMT_COOKIE)?.value || '';
  if (!token) return null;
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Accept')) headers.set('Accept', '*/*');
  const signal = init.signal || (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(10_000)
    : undefined);
  return fetch(`${SPMT_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers,
    cache: 'no-store',
    signal,
  });
}

export function spmtBaseUrl() {
  return SPMT_BASE_URL;
}
