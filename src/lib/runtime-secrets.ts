function requireSecret(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value) return value;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} is not configured.`);
  }

  return devFallback;
}

export function getBotSecret(): string {
  return requireSecret('BOT_SECRET_KEY', '1234');
}

export function getStreamweaverSecret(): string {
  const streamweaverSecret = process.env.STREAMWEAVER_SECRET;
  if (streamweaverSecret) return streamweaverSecret;

  const botSecret = process.env.BOT_SECRET_KEY;
  if (botSecret) return botSecret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('STREAMWEAVER_SECRET or BOT_SECRET_KEY is not configured.');
  }

  return '1234';
}

export function getSessionSecret(): string {
  const sessionSecret = process.env.NEXTAUTH_SECRET || process.env.BOT_SECRET_KEY;
  if (sessionSecret) return sessionSecret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXTAUTH_SECRET is not configured.');
  }

  return 'chat-tag-default-secret';
}
