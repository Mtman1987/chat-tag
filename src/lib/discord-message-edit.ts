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
  attachmentUrl?: string;
  attachmentName?: string;
}): Promise<boolean> {
  const messageId = String(input.result.messageId || '').trim();
  if (!messageId) return false;
  const payload = {
    content: input.content || '',
    embeds: input.embeds,
    components: input.components || [],
    allowed_mentions: { parse: [] },
  };

  let attachmentBytes: Uint8Array | null = null;
  let attachmentName = String(input.attachmentName || 'pack-animation.gif').trim() || 'pack-animation.gif';
  if (input.attachmentUrl) {
    const media = await fetch(input.attachmentUrl, { signal: timeoutSignal(15_000) }).catch(() => null);
    if (media?.ok) attachmentBytes = new Uint8Array(await media.arrayBuffer());
  }

  function requestBody() {
    if (!attachmentBytes) {
      return { body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } };
    }
    const form = new FormData();
    const bytes = attachmentBytes.buffer.slice(
      attachmentBytes.byteOffset,
      attachmentBytes.byteOffset + attachmentBytes.byteLength,
    ) as ArrayBuffer;
    form.append('payload_json', JSON.stringify({
      ...payload,
      attachments: [{ id: 0, filename: attachmentName }],
    }));
    form.append('files[0]', new Blob([bytes], { type: 'image/gif' }), attachmentName);
    return { body: form as BodyInit, headers: {} as Record<string, string> };
  }

  if (input.result.via === 'webhook' && input.result.webhook?.id && input.result.webhook?.token) {
    const response = await fetch(
      `https://discord.com/api/v10/webhooks/${input.result.webhook.id}/${input.result.webhook.token}/messages/${messageId}`,
      {
        method: 'PATCH',
        ...requestBody(),
        signal: timeoutSignal(10_000),
      },
    ).catch(() => null);
    if (response?.ok) return true;
  }

  const botToken = String(input.botToken || process.env.DISCORD_BOT_TOKEN || '').trim();
  if (!botToken) return false;
  const botBody = requestBody();
  const response = await fetch(`https://discord.com/api/v10/channels/${input.channelId}/messages/${messageId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bot ${botToken}`,
      ...botBody.headers,
    },
    body: botBody.body,
    signal: timeoutSignal(10_000),
  }).catch(() => null);
  return Boolean(response?.ok);
}
