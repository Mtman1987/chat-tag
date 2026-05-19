export function sanitizeQuackverseRoomToken(value: unknown, fallback = 'default'): string {
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return cleaned || fallback;
}

export function quackverseScopeFromParams(params: URLSearchParams): string {
  return sanitizeQuackverseRoomToken(
    params.get('tenant') ||
      params.get('tenantId') ||
      params.get('channel') ||
      params.get('streamer') ||
      params.get('broadcaster') ||
      '',
    '',
  );
}

export function quackverseRoomIdFromParams(params: URLSearchParams): string {
  return sanitizeQuackverseRoomToken(params.get('roomId') || params.get('room') || 'default');
}

export function quackverseRoomKeyFromParams(params: URLSearchParams): string {
  const scope = quackverseScopeFromParams(params);
  const roomId = quackverseRoomIdFromParams(params);
  return scope ? `${scope}:${roomId}` : roomId;
}

export function quackverseRoomLabel(scope: string, roomId: string): string {
  return scope ? `${scope} / ${roomId}` : roomId;
}
