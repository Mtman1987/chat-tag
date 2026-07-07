import { NextResponse } from 'next/server';
import { readAppState, updateAppState, type JsonObject } from '@/lib/volume-store';
import { getPublicAppOrigin } from '@/lib/public-origin';

export type DiscordWebhookRecord = {
  id: string;
  token: string;
  channelId: string;
  name?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type DiscordSendResult =
  | { ok: true; via: 'webhook' | 'bot'; messageId?: string; webhook?: DiscordWebhookRecord }
  | { ok: false; error: string };

export type DiscordSendPayload = {
  channelId: string;
  content: string;
  username?: string;
  avatarUrl?: string;
  embeds?: JsonObject[];
  components?: JsonObject[];
  allowedMentions?: JsonObject;
  webhookName?: string;
  recordHistorySource?: string;
  cleanupAfterMs?: number;
  fallbackToBot?: boolean;
  botToken?: string;
};

function timeoutSignal(milliseconds: number) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), milliseconds);
  return controller.signal;
}

function normalizeDiscordUrl(value: unknown): string | undefined {
  const raw = String(value || '').trim();
  if (!raw) return undefined;

  try {
    return new URL(raw).toString();
  } catch {}

  if (raw.startsWith('/')) {
    const origin = getPublicAppOrigin();
    if (origin) {
      try {
        return new URL(raw, origin).toString();
      } catch {}
    }
  }

  return undefined;
}

function sanitizeDiscordEmbeds(embeds: JsonObject[] | undefined): JsonObject[] | undefined {
  if (!Array.isArray(embeds)) return embeds;

  return embeds.map((embed) => {
    const next: any = { ...embed };
    for (const key of ['image', 'thumbnail'] as const) {
      if (next[key]?.url) {
        const url = normalizeDiscordUrl(next[key].url);
        if (url) next[key] = { ...next[key], url };
        else delete next[key];
      }
    }
    for (const key of ['author', 'footer'] as const) {
      if (next[key]?.icon_url) {
        const iconUrl = normalizeDiscordUrl(next[key].icon_url);
        if (iconUrl) next[key] = { ...next[key], icon_url: iconUrl };
        else {
          const copy = { ...next[key] };
          delete copy.icon_url;
          next[key] = copy;
        }
      }
    }
    return next;
  });
}

function normalizeWebhookRecord(channelId: string, webhook: any, fallbackName: string): DiscordWebhookRecord {
  return {
    id: String(webhook?.id || ''),
    token: String(webhook?.token || ''),
    channelId: String(channelId || ''),
    name: String(webhook?.name || fallbackName || 'Chat Tag'),
    createdAt: webhook?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function recordDiscordMessageHistory(entry: JsonObject): Promise<void> {
  await updateAppState((state) => {
    const history = Array.isArray(state.discordMessages?.history) ? state.discordMessages.history : [];
    history.push({
      id: entry.id || `discord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: entry.timestamp || new Date().toISOString(),
      ...entry,
    });
    const trimmed = history.slice(-200);
    state.discordMessages = {
      ...(state.discordMessages || {}),
      history: trimmed,
    };
  });
}

export async function getOrCreateDiscordWebhook(
  channelId: string,
  botToken: string,
  webhookName = 'Chat Tag'
): Promise<DiscordWebhookRecord> {
  const normalizedChannelId = String(channelId || '').trim();
  if (!normalizedChannelId) {
    throw new Error('channelId is required');
  }
  if (!/^\d+$/.test(normalizedChannelId)) {
    throw new Error('channelId must be a Discord channel id');
  }

  const state = await readAppState();
  const cached = state.discordWebhooks?.[normalizedChannelId];
  if (cached?.id && cached?.token) {
    return normalizeWebhookRecord(normalizedChannelId, cached, webhookName);
  }

  const webhooksRes = await fetch(`https://discord.com/api/v10/channels/${normalizedChannelId}/webhooks`, {
    headers: { Authorization: `Bot ${botToken}` },
    signal: timeoutSignal(7_000),
  });

  if (webhooksRes.ok) {
    const webhooks = await webhooksRes.json();
    const existing = Array.isArray(webhooks)
      ? webhooks.find((entry: any) => entry.name === webhookName)
        || webhooks.find((entry: any) => entry.name === 'Chat Tag')
        || webhooks.find((entry: any) => entry.name === 'Stream Hub')
        || webhooks.find((entry: any) => entry.name === 'HearMeOut')
        || webhooks[0]
      : null;

    if (existing?.id && existing?.token) {
      const record = normalizeWebhookRecord(normalizedChannelId, existing, webhookName);
      await updateAppState((draft) => {
        draft.discordWebhooks[normalizedChannelId] = record;
      });
      return record;
    }
  }

  const createRes = await fetch(`https://discord.com/api/v10/channels/${normalizedChannelId}/webhooks`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: webhookName }),
    signal: timeoutSignal(7_000),
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create webhook: ${createRes.status} ${await createRes.text()}`);
  }

  const webhook = await createRes.json();
  const record = normalizeWebhookRecord(normalizedChannelId, webhook, webhookName);
  await updateAppState((draft) => {
    draft.discordWebhooks[normalizedChannelId] = record;
  });
  return record;
}

async function sendDiscordViaBot(channelId: string, payload: DiscordSendPayload, botToken: string): Promise<DiscordSendResult> {
  const embeds = sanitizeDiscordEmbeds(payload.embeds);
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: payload.content,
      embeds,
      components: payload.components,
      allowed_mentions: payload.allowedMentions || { parse: [] },
    }),
    signal: timeoutSignal(7_000),
  });

  if (!res.ok) {
    return { ok: false, error: `Bot message send failed (${res.status}): ${await res.text()}` };
  }

  const message = await res.json().catch(() => null);
  if (message?.id) {
    await recordDiscordMessageHistory({
      source: payload.recordHistorySource || 'discord-send',
      channelId,
      messageId: message.id,
      transport: 'bot',
      username: payload.username || null,
      avatarUrl: payload.avatarUrl || null,
      content: payload.content,
      embeds: embeds || [],
      components: payload.components || [],
    });
  }

  return { ok: true, via: 'bot', messageId: message?.id || undefined };
}

export async function sendDiscordMessage(payload: DiscordSendPayload): Promise<DiscordSendResult> {
  const botToken = payload.botToken || process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    return { ok: false, error: 'DISCORD_BOT_TOKEN is not configured' };
  }

  const channelId = String(payload.channelId || '').trim();
  if (!channelId) {
    return { ok: false, error: 'channelId is required' };
  }
  if (!/^\d+$/.test(channelId)) {
    return { ok: false, error: 'channelId must be a Discord channel id' };
  }

  if (!String(payload.content || '').trim() && (!payload.embeds || payload.embeds.length === 0)) {
    return { ok: false, error: 'content or embeds are required' };
  }

  try {
    const embeds = sanitizeDiscordEmbeds(payload.embeds);
    const webhook = await getOrCreateDiscordWebhook(channelId, botToken, payload.webhookName || 'Chat Tag');
    const res = await fetch(`https://discord.com/api/v10/webhooks/${webhook.id}/${webhook.token}?wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: payload.content,
        username: payload.username || 'Chat Tag',
        avatar_url: payload.avatarUrl || undefined,
        embeds,
        components: payload.components,
        allowed_mentions: payload.allowedMentions || { parse: [] },
      }),
      signal: timeoutSignal(7_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      const shouldFallback = res.status === 403 || res.status === 404 || res.status >= 500 || payload.fallbackToBot !== false;
      if (!shouldFallback) {
        return { ok: false, error: `Webhook send failed (${res.status}): ${errText}` };
      }

      await updateAppState((draft) => {
        if (draft.discordWebhooks?.[channelId]?.id === webhook.id) {
          delete draft.discordWebhooks[channelId];
        }
      });

      const fallback = await sendDiscordViaBot(channelId, payload, botToken);
      if (fallback.ok) {
        return fallback;
      }

      return { ok: false, error: `Webhook send failed (${res.status}): ${errText}; fallback failed: ${fallback.error}` };
    }

    const message = await res.json().catch(() => null);
    await recordDiscordMessageHistory({
      source: payload.recordHistorySource || 'discord-send',
      channelId,
      webhookId: webhook.id,
      messageId: message?.id || null,
      transport: 'webhook',
      username: payload.username || null,
      avatarUrl: payload.avatarUrl || null,
      content: payload.content,
      embeds: payload.embeds || [],
      components: payload.components || [],
    });

    return { ok: true, via: 'webhook', messageId: message?.id || undefined, webhook };
  } catch (error: any) {
    const fallback = payload.fallbackToBot === false ? null : await sendDiscordViaBot(channelId, payload, botToken).catch(() => null);
    if (fallback?.ok) return fallback;
    return { ok: false, error: error?.message || 'Discord send failed' };
  }
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
