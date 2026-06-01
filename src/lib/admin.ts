import { getRuntimePublicValueWithDevFallback } from './runtime-config';

const DEFAULT_ADMIN_USERNAMES = ['mtman1987', 'lovesnightmare'];

function parseAdminUsernames(source?: string | null): string[] {
  return String(source || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function getAdminUsernames(): string[] {
  const configured = parseAdminUsernames(
    getRuntimePublicValueWithDevFallback(
      'adminUsernames',
      ['ADMIN_USERNAMES', 'NEXT_PUBLIC_ADMIN_USERNAMES'],
      ''
    )
  );
  return configured.length > 0 ? configured : DEFAULT_ADMIN_USERNAMES;
}

export function isAdminUsername(username?: string | null): boolean {
  if (!username) return false;
  return getAdminUsernames().includes(String(username).toLowerCase());
}
