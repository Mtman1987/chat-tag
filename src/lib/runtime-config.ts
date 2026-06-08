export type RuntimeConfig = {
  publicUrls?: {
    appOrigin?: string;
    botUrl?: string;
    dshUrl?: string;
    streamweaverApiBase?: string;
  };
  publicValues?: {
    twitchClientId?: string;
    discordWebhookUrl?: string;
    discordGuildId?: string;
    autoRotateMinutes?: string;
    adminUsernames?: string;
  };
  updatedAt?: string;
};

export function getRuntimePublicValueWithDevFallback(
  key: keyof NonNullable<RuntimeConfig['publicValues']>,
  devEnvNames: string[],
  fallback = ''
) {
  for (const envName of devEnvNames) {
    if (!envName.startsWith('NEXT_PUBLIC_')) continue;
    const value = String(process.env[envName] || '').trim();
    if (value) return value;
  }

  if (process.env.NODE_ENV !== 'production') {
    for (const envName of devEnvNames) {
      const value = String(process.env[envName] || '').trim();
      if (value) return value;
    }
  }

  return String(fallback || '').trim();
}
