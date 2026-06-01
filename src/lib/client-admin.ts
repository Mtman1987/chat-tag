const DEFAULT_ADMIN_USERNAMES = ['mtman1987', 'lovesnightmare'];

function parseAdminUsernames(source?: string | null): string[] {
  return String(source || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function getClientAdminUsernames(): string[] {
  const configured = parseAdminUsernames(process.env.NEXT_PUBLIC_ADMIN_USERNAMES);
  return configured.length > 0 ? configured : DEFAULT_ADMIN_USERNAMES;
}

export function isClientAdminUsername(username?: string | null): boolean {
  if (!username) return false;
  return getClientAdminUsernames().includes(String(username).toLowerCase());
}
