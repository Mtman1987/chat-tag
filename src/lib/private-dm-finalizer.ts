import { getRuntimePublicUrl } from '@/lib/runtime-config.server';
import { getStreamweaverSecret } from '@/lib/runtime-secrets';

function timeoutSignal(milliseconds: number) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), milliseconds);
  return controller.signal;
}

function getStreamweaverOrigin(): string {
  return getRuntimePublicUrl(
    'streamweaverApiBase',
    process.env.STREAMWEAVER_URL || process.env.STREAMWEAVE_URL || 'https://streamweaver-new.fly.dev',
  );
}

export async function finalizePrivateDmDiscordMessage(
  channelId: string,
  messageId: string,
): Promise<boolean> {
  const normalizedChannelId = String(channelId || '').trim();
  const normalizedMessageId = String(messageId || '').trim();
  if (!/^\d{15,22}$/.test(normalizedChannelId) || !/^\d{15,22}$/.test(normalizedMessageId)) {
    return false;
  }

  try {
    const response = await fetch(
      `${getStreamweaverOrigin().replace(/\/$/, '')}/api/private-chat/finalize-discord-message`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getStreamweaverSecret()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channelId: normalizedChannelId,
          messageId: normalizedMessageId,
        }),
        signal: timeoutSignal(10_000),
      },
    );
    if (!response.ok) {
      console.warn('[Private DM Finalizer] StreamWeaver rejected the message:', response.status);
      return false;
    }
    const payload = await response.json().catch(() => null);
    return Boolean(payload?.success && payload?.finalized);
  } catch (error) {
    console.warn('[Private DM Finalizer] StreamWeaver request failed:', error);
    return false;
  }
}
