import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { readAppState, updateAppState, updateAppStateIfChanged } from '@/lib/volume-store';
import { getSessionSecret } from '@/lib/runtime-secrets';
import { buildGameDiscordCard } from '@/lib/game-discord-cards';

const PREFIX = 'nebula-game:';
const keyFor = (channel: string, gameId: string) => `${PREFIX}${channel}:${gameId}`;
type Sealed = { iv: string; tag: string; ciphertext: string };
type Connection = { channel: string; gameId: string; revision: string; sealed: Sealed; fingerprint: string; discordChannelId: string; webhookName: string;
  lastCompletedArtworkId?: string;
  messageId?: string; lastHash?: string; lastSyncedAt?: string; nextAttempt: number; leaseUntil: number;
  status: 'ready' | 'sending' | 'connected' | 'retrying' | 'paused'; error?: string };
export class GameDiscordError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function normalizeGameWebhook(value: unknown) {
  let url: URL;
  try { url = new URL(String(value || '').trim()); } catch { throw new GameDiscordError('Paste a Discord channel webhook URL.'); }
  const match = url.pathname.match(/^\/api(?:\/v\d+)?\/webhooks\/(\d+)\/([A-Za-z0-9_-]+)\/?$/);
  if (url.protocol !== 'https:' || !['discord.com', 'discordapp.com'].includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash || !match) {
    throw new GameDiscordError('Use a Discord text-channel webhook URL beginning with https://discord.com/api/webhooks/.');
  }
  return `https://discord.com/api/v10/webhooks/${match[1]}/${match[2]}`;
}
const encryptionKey = () => createHash('sha256').update(`nebula-game-webhooks:v1:${getSessionSecret()}`).digest();
function seal(url: string): Sealed {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(url, 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}
function unseal(value: Sealed) {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return normalizeGameWebhook(Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
}
function publicConnection(record?: Connection) {
  if (!record) return { configured: false };
  return { configured: true, discordChannelId: record.discordChannelId, webhookName: record.webhookName,
    status: record.status, error: record.error || '', lastSyncedAt: record.lastSyncedAt || null,
    messageId: record.messageId || null };
}
export async function getGameDiscordConnection(channel: string, gameId: string) {
  return publicConnection((await readAppState()).discordWebhooks[keyFor(channel, gameId)] as Connection | undefined);
}
async function request(url: string, init?: RequestInit) {
  return fetch(url, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(7000) });
}
export async function saveGameDiscordConnection(channel: string, gameId: string, value: unknown) {
  const url = normalizeGameWebhook(value);
  let response: Response;
  try { response = await request(url); } catch { throw new GameDiscordError('Discord could not be reached. Your previous setting is unchanged.', 503); }
  const webhook = await response.json().catch(() => null);
  if (!response.ok || webhook?.type !== 1 || !/^\d+$/.test(String(webhook?.channel_id || ''))) throw new GameDiscordError('Discord could not verify this incoming webhook. Check the URL and its channel.');
  const key = keyFor(channel, gameId), fingerprint = createHash('sha256').update(url).digest('hex');
  await updateAppState(state => {
    const previous = state.discordWebhooks[key] as Connection | undefined;
    if (previous && previous.leaseUntil > Date.now()) throw new GameDiscordError('The game card is being updated. Try again in a few seconds.', 409);
    state.discordWebhooks[key] = { channel, gameId, revision: randomUUID(), sealed: seal(url), fingerprint,
      discordChannelId: String(webhook.channel_id), webhookName: String(webhook.name || 'Nebula Arcade').slice(0, 100),
      messageId: previous?.fingerprint === fingerprint ? previous.messageId : undefined,
      nextAttempt: 0, leaseUntil: 0, status: 'ready' } satisfies Connection;
  });
  await syncOne(key);
  return getGameDiscordConnection(channel, gameId);
}
export async function removeGameDiscordConnection(channel: string, gameId: string) {
  await updateAppState(state => {
    const key = keyFor(channel, gameId), current = state.discordWebhooks[key] as Connection | undefined;
    if (current && current.leaseUntil > Date.now()) throw new GameDiscordError('The game card is being updated. Try again in a few seconds.', 409);
    delete state.discordWebhooks[key];
  });
  return { configured: false };
}
async function syncOne(key: string) {
  const record = await updateAppStateIfChanged<Connection | null>(state => {
    const current = state.discordWebhooks[key] as Connection | undefined;
    if (!current || current.status === 'paused' || current.nextAttempt > Date.now() || current.leaseUntil > Date.now()) return { changed: false, result: null };
    // A restart between POST and persisting its ID leaves an uncertain delivery.
    // Pause rather than potentially posting the same card a second time.
    if (current.status === 'sending' && !current.messageId) {
      current.status = 'paused'; current.error = 'Delivery could not be confirmed. Check Discord before saving again to send a new card.';
      return { changed: true, result: null };
    }
    current.status = 'sending'; current.leaseUntil = Date.now() + 30_000;
    return { changed: true, result: structuredClone(current) };
  });
  if (!record) return;
  const patch: Partial<Connection> = { leaseUntil: 0, nextAttempt: Date.now() + 30_000 };
  try {
    const cardState = await readAppState();
    const completed = record.gameId === 'pixelbattle' ? cardState.gameSettings?.default?.gameHub?.channels?.[record.channel]?.mosaic?.current : null;
    const card = buildGameDiscordCard(cardState, record.channel, record.gameId);
    const hash = createHash('sha256').update(JSON.stringify(card)).digest('hex');
    if (record.messageId && hash === record.lastHash) { patch.status = 'connected'; patch.error = ''; if (completed?.status === 'completed') patch.lastCompletedArtworkId = completed.id; }
    else {
      const url = unseal(record.sealed);
      const { username, ...editCard } = card;
      const response = await request(record.messageId ? `${url}/messages/${record.messageId}` : `${url}?wait=true`, {
        method: record.messageId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record.messageId ? editCard : card),
      });
      const body = await response.json().catch(() => null);
      if (response.ok && /^\d+$/.test(String(body?.id || ''))) {
        if (completed?.status === 'completed') patch.lastCompletedArtworkId = completed.id;
        Object.assign(patch, { status: 'connected', messageId: String(body.id), lastHash: hash, lastSyncedAt: new Date().toISOString(), error: '' });
      } else if (response.status === 429) {
        Object.assign(patch, { status: 'retrying', nextAttempt: Date.now() + Math.max(30_000, Math.min(3600_000, Number(body?.retry_after || 30) * 1000)), error: 'Discord asked us to wait. Updates will resume automatically.' });
      } else if (response.status === 404 && body?.code === 10008 && record.messageId) {
        Object.assign(patch, { status: 'ready', messageId: undefined, lastHash: undefined, error: 'The old game card was deleted. A new card will be sent on the next update.' });
      } else if (response.status >= 500 && record.messageId) {
        Object.assign(patch, { status: 'retrying', nextAttempt: Date.now() + 60_000, error: 'Discord is temporarily unavailable. Updates will retry.' });
      } else {
        Object.assign(patch, { status: 'paused', error: response.status >= 500 || response.ok
          ? 'Delivery could not be confirmed. Check Discord before saving again to send a new card.'
          : `Discord rejected the card (${response.status}). Check the webhook and text channel, then save again.` });
      }
    }
  } catch {
    Object.assign(patch, { status: record.messageId ? 'retrying' : 'paused', nextAttempt: Date.now() + 60_000,
      error: record.messageId ? 'The card could not be updated. Retrying shortly; replace the webhook if this persists.' : 'Delivery could not be confirmed. Check Discord before saving again to send a new card.' });
  }
  await updateAppStateIfChanged(state => {
    const current = state.discordWebhooks[key] as Connection | undefined;
    if (current?.revision !== record.revision) return { changed: false, result: null };
    Object.assign(current, patch);
    return { changed: true, result: null };
  });
}
let syncing: Promise<void> | null = null;
export function syncGameDiscordConnections(): Promise<void> {
  if (syncing) return syncing;
  syncing = (async () => {
    const state = await readAppState();
    const keys = Object.entries(state.discordWebhooks).filter(([key, value]) => key.startsWith(PREFIX) && value.status !== 'paused' && value.nextAttempt <= Date.now() && value.leaseUntil <= Date.now())
      .sort((a, b) => a[1].nextAttempt - b[1].nextAttempt).slice(0, 8).map(([key]) => key);
    await Promise.allSettled(keys.map(key => syncOne(key)));
  })().catch(() => { console.warn('[GameDiscord] Could not sync game cards; will retry on the next tick.'); }).finally(() => { syncing = null; });
  return syncing;
}
