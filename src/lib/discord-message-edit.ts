import type { DiscordSendResult } from '@/lib/discord-webhooks';

function timeoutSignal(milliseconds: number) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), milliseconds);
  return controller.signal;
}

export async function editDiscordSentMessage(input: {
  channelId: string;
  result: Extract<DiscordSendResult, { ok: true }>;
  embeds: Record<string, unknown>[];
  content?: string;
  components?: Record<string, unknown>[];
  botToken?: string;
}): Promise<boolean> {
  const messageId = String(input.result.messageId || '').trim();
  if (!messageId) return false;
  const payload = {
    content: input.content || '',
    embeds: input.embeds,
    components: input.components || [],
    allowed_mentions: { parse: [] },
  };

  if (input.result.via === 'webhook' && input.result.webhook?.id && input.result.webhook?.token) {
    const response = await fetch(
      `https://discord.com/api/v10/webhooks/${input.result.webhook.id}/${input.result.webhook.token}/messages/${messageId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: timeoutSignal(10_000),
      },
    ).catch(() => null);
    if (response?.ok) return true;
  }

  const botToken = String(input.botToken || process.env.DISCORD_BOT_TOKEN || '').trim();
  if (!botToken) return false;
  const response = await fetch(`https://discord.com/api/v10/channels/${input.channelId}/messages/${messageId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: timeoutSignal(10_000),
  }).catch(() => null);
  return Boolean(response?.ok);
}
