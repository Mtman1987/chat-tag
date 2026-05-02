export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('session');
}

export function getAuthHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  const token = getSessionToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
}
