import crypto from 'crypto';

const SECRET = process.env.NEXTAUTH_SECRET || process.env.BOT_SECRET_KEY || 'chat-tag-default-secret';

export interface SessionUser {
  id: string;
  twitchUsername: string;
  avatarUrl: string;
}

export function createSessionToken(user: SessionUser): string {
  const payload = JSON.stringify({ ...user, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 }); // 30 days
  const b64 = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

export function verifySessionToken(token: string): SessionUser | null {
  try {
    const [b64, sig] = token.split('.');
    if (!b64 || !sig) return null;
    const expected = crypto.createHmac('sha256', SECRET).update(b64).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString());
    if (payload.exp && payload.exp < Date.now()) return null;
    return { id: payload.id, twitchUsername: payload.twitchUsername, avatarUrl: payload.avatarUrl };
  } catch {
    return null;
  }
}
