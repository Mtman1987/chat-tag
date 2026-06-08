export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('session');
}

export function getAuthHeaders(init?: HeadersInit): Headers {
  return new Headers(init);
}
