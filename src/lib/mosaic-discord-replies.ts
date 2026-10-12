import { readAppState, updateAppStateIfChanged } from '@/lib/volume-store';
import { sendDiscordMessage, type DiscordSendResult } from '@/lib/discord-webhooks';
import { editDiscordSentMessage } from '@/lib/discord-message-edit';
import { resolveDiscordMosaicTarget } from '@/lib/discord-mosaic-command';

export const MOSAIC_REPLY_WINDOW_MS = 10 * 60_000;
const PREFIX = 'mosaic-reply:';
type Sent = Extract<DiscordSendResult, { ok: true }>;
type Entry = { command: string; result: string };
type RecordData = { channelId: string; expiresAt: number; result: Sent; history: Entry[]; retryAt?: number };
type Input = { channelId: string; userId: string; userName: string; avatarUrl: string; command: string; content: string; botToken: string };
type Dependencies = {
  read: () => Promise<any>;
  save: (key: string, record: RecordData) => Promise<void>;
  remove: (key: string) => Promise<void>;
  send: (payload: any) => Promise<DiscordSendResult>;
  edit: (payload: any) => Promise<boolean>;
  delete: (record: RecordData, botToken: string) => Promise<boolean>;
  now: () => number;
};

async function deleteReply(record: RecordData, botToken: string) {
  const result = record.result;
  if (!result.messageId) return true;
  const webhook = result.via === 'webhook' ? result.webhook : undefined;
  const useWebhook = Boolean(webhook?.id && webhook.token);
  const url = useWebhook
    ? 'https://discord.com/api/v10/webhooks/' + webhook!.id + '/' + webhook!.token + '/messages/' + result.messageId
    : 'https://discord.com/api/v10/channels/' + record.channelId + '/messages/' + result.messageId;
  if (!useWebhook && !botToken) return false;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: useWebhook ? {} : { Authorization: 'Bot ' + botToken },
    signal: AbortSignal.timeout(7000),
  }).catch(() => null);
  return Boolean(response && (response.ok || response.status === 404));
}

const defaults: Dependencies = {
  read: readAppState,
  save: async (key, record) => { await updateAppStateIfChanged(state => {
    state.discordWebhooks[key] = record;
    return { changed: true, result: null };
  }); },
  remove: async key => { await updateAppStateIfChanged(state => {
    if (!state.discordWebhooks[key]) return { changed: false, result: null };
    delete state.discordWebhooks[key];
    return { changed: true, result: null };
  }); },
  send: sendDiscordMessage,
  edit: editDiscordSentMessage,
  delete: deleteReply,
  now: Date.now,
};

export function mosaicReplyEmbed(input: Input, history: Entry[], expiresAt: number) {
  return {
    title: 'Nebula Arcade · Mosaic',
    description: input.content.slice(0, 1800),
    color: 0x00d9ff,
    author: { name: input.userName, ...(input.avatarUrl ? { icon_url: input.avatarUrl } : {}) },
    ...(input.avatarUrl ? { thumbnail: { url: input.avatarUrl } } : {}),
    fields: history.length > 1 ? [{
      name: 'Recent commands',
      value: history.slice(0, -1).reverse().map(item => '**' + item.command + '**\n' + item.result.slice(0, 120)).join('\n\n').slice(0, 1024),
    }] : [],
    footer: { text: input.userName + ' • ' + input.command + ' • 10-minute command history' },
    timestamp: new Date(expiresAt - MOSAIC_REPLY_WINDOW_MS).toISOString(),
  };
}

export function createMosaicReplyService(overrides: Partial<Dependencies> = {}) {
  const deps = { ...defaults, ...overrides };
  const queues = new Map<string, Promise<unknown>>();
  async function locked<T>(key: string, work: () => Promise<T>): Promise<T> {
    const pending = (queues.get(key) || Promise.resolve()).catch(() => {}).then(work);
    queues.set(key, pending);
    try { return await pending; } finally { if (queues.get(key) === pending) queues.delete(key); }
  }
  async function expire(key: string, record: RecordData, botToken: string) {
    if (!await deps.delete(record, botToken)) {
      await deps.save(key, { ...record, retryAt: deps.now() + 30_000 });
      return false;
    }
    await deps.remove(key);
    return true;
  }
  return {
    async reply(input: Input): Promise<Sent> {
      const key = PREFIX + input.channelId + ':' + input.userId;
      return locked(key, async () => {
        const state = await deps.read();
        let record = state.discordWebhooks?.[key] as RecordData | undefined;
        if (record && record.expiresAt <= deps.now()) {
          if (!await expire(key, record, input.botToken)) throw new Error('Mosaic reply cleanup is retrying. Please try again shortly.');
          record = undefined;
        }
        const expiresAt = record?.expiresAt || deps.now() + MOSAIC_REPLY_WINDOW_MS;
        const history = [...(record?.history || []), { command: input.command.slice(0, 100), result: input.content.slice(0, 300) }].slice(-5);
        const embeds = [mosaicReplyEmbed(input, history, expiresAt)];
        if (record) {
          const edited = await deps.edit({ channelId: input.channelId, result: record.result, embeds, botToken: input.botToken });
          if (!edited) throw new Error('Mosaic reply could not be updated. Please try again shortly.');
          await deps.save(key, { ...record, history });
          return record.result;
        }
        const sent = await deps.send({
          channelId: input.channelId, content: '', username: input.userName,
          avatarUrl: input.avatarUrl, embeds, allowedMentions: { parse: [] },
          botToken: input.botToken, recordHistorySource: 'discord/mosaic-reply',
        });
        if (!sent.ok) throw new Error(sent.error);
        if (!sent.messageId) throw new Error('Mosaic reply delivery could not be confirmed.');
        await deps.save(key, { channelId: input.channelId, expiresAt, result: sent, history });
        return sent;
      });
    },
    async cleanup(botToken: string) {
      const state = await deps.read();
      const expired = Object.entries(state.discordWebhooks || {})
        .filter(([key, value]: [string, any]) => key.startsWith(PREFIX)
          && value.expiresAt <= deps.now() && Number(value.retryAt || 0) <= deps.now())
        .slice(0, 8);
      await Promise.all(expired.map(([key]) => locked(key, async () => {
        const latest = (await deps.read()).discordWebhooks?.[key] as RecordData | undefined;
        if (latest && latest.expiresAt <= deps.now()) await expire(key, latest, botToken);
      })));
    },
  };
}

// Web route and lifecycle bundles share the queue within the same server.
const shared = globalThis as typeof globalThis & { __mosaicReplyService?: ReturnType<typeof createMosaicReplyService> };
const service = shared.__mosaicReplyService ||= createMosaicReplyService();
export const sendMosaicDiscordReply = service.reply;
export async function cleanupMosaicDiscordReplies(botToken: string) {
  await updateAppStateIfChanged(state => ({ changed: adoptLegacyMosaicReplies(state), result: null }));
  await service.cleanup(botToken);
}

// Only command replies in channels linked to Mosaic can enter this cleanup queue.
export function adoptLegacyMosaicReplies(state: any, now = Date.now()) {
  let changed = false;
    for (const item of state.discordMessages?.history || []) {
      if (item.source !== 'discord/chat' || item.mosaicCleanupQueued || !item.messageId) continue;
      const embed = item.embeds?.[0];
      const command = String(embed?.footer?.text || '').split(' • ').slice(1).join(' • ');
      if (!/^Nebula Arcade · (?:Mosaic|Chat Tag)$/.test(String(embed?.title || ''))
        || !resolveDiscordMosaicTarget(state, String(item.channelId), command)) continue;
      const webhook = state.discordWebhooks[String(item.channelId)];
      const result: Sent = { ok: true, via: item.transport === 'webhook' ? 'webhook' : 'bot', messageId: String(item.messageId) };
      if (result.via === 'webhook') {
        if (!webhook?.id || !webhook.token) continue;
        result.webhook = webhook as any;
      }
      const key = PREFIX + 'legacy:' + item.messageId;
      state.discordWebhooks[key] = { channelId: String(item.channelId), result, history: [],
        expiresAt: (Date.parse(String(item.timestamp)) || now) + MOSAIC_REPLY_WINDOW_MS };
      item.mosaicCleanupQueued = true;
      changed = true;
    }
  return changed;
}
