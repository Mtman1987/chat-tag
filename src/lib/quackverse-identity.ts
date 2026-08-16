import type { SessionUser } from '@/lib/session';

export function normalizedIdentityName(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function spmtIdentityTwitchName(identity: any): string {
  return String(
    identity?.twitchUsername
    || identity?.twitch_username
    || identity?.displayName
    || identity?.display_name
    || identity?.username
    || '',
  ).trim();
}

export function resolveChatTagAppUserId(identity: any, legacySession: SessionUser | null | undefined): string {
  const canonicalId = String(identity?.id || '').trim();
  if (!canonicalId || !legacySession?.id || !/^\d+$/.test(String(legacySession.id))) return canonicalId;

  const identityName = normalizedIdentityName(spmtIdentityTwitchName(identity));
  const legacyName = normalizedIdentityName(legacySession.twitchUsername);
  if (!identityName || !legacyName || identityName !== legacyName) return canonicalId;

  return String(legacySession.id);
}

export function findLegacyTwitchUserRecord(
  users: Record<string, any> | null | undefined,
  twitchUsername: unknown,
): { id: string; twitchUsername: string; avatarUrl: string } | null {
  const wanted = normalizedIdentityName(twitchUsername);
  if (!wanted) return null;

  for (const [key, raw] of Object.entries(users || {})) {
    const id = String(raw?.id || key || '').trim();
    const name = String(raw?.twitchUsername || raw?.username || '').trim();
    if (!/^\d+$/.test(id) || normalizedIdentityName(name) !== wanted) continue;
    return {
      id,
      twitchUsername: name,
      avatarUrl: String(raw?.avatarUrl || raw?.avatar || ''),
    };
  }

  return null;
}
