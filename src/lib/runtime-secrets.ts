function requireSecret(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value) return value;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} is not configured.`);
  }

  return devFallback;
}

function firstAvailableSecret(names: string[]): string {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

export function getBotSecret(): string {
  const value = firstAvailableSecret(['BOT_SECRET_KEY', 'CHAT_TAG_BOT_SECRET', 'DSH_CLIENT_SECRET', 'DSH_SERVICE_SECRET']);
  if (value) return value;
  return requireSecret('BOT_SECRET_KEY', '1234');
}

export function getStreamweaverSecret(): string {
  const streamweaverSecret = process.env.STREAMWEAVER_SECRET || process.env.STREAMWEAVER_CLIENT_SECRET;
  if (streamweaverSecret) return streamweaverSecret;

  const botSecret = firstAvailableSecret(['BOT_SECRET_KEY', 'CHAT_TAG_BOT_SECRET', 'DSH_CLIENT_SECRET', 'DSH_SERVICE_SECRET']);
  if (botSecret) return botSecret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('STREAMWEAVER_SECRET or BOT_SECRET_KEY is not configured.');
  }

  return '1234';
}

export function getSessionSecret(): string {
  const sessionSecret = process.env.NEXTAUTH_SECRET || firstAvailableSecret(['BOT_SECRET_KEY', 'CHAT_TAG_BOT_SECRET', 'DSH_CLIENT_SECRET', 'DSH_SERVICE_SECRET']);
  if (sessionSecret) return sessionSecret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXTAUTH_SECRET is not configured.');
  }

  return 'chat-tag-default-secret';
}
