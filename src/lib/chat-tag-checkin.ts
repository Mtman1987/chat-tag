import { randomUUID } from 'node:crypto';
import type { AppState } from '@/lib/volume-store';
import { getStreamweaverSecret } from '@/lib/runtime-secrets';

const ACTIVE_CHAT_MS = Number(process.env.AUTO_ROTATE_MINUTES || 4) * 60_000;
const STREAMWEAVER_URL = String(process.env.STREAMWEAVER_URL || process.env.STREAMWEAVE_URL || 'https://streamweaver-new.fly.dev').replace(/\/$/, '');

export function checkinChatters(state: AppState, channel: string, username: string, userId: unknown, displayName: string, now = Date.now()) {
  const chatters = new Map<string, { login: string; name: string; userId: string }>();
  for (const player of Object.values(state.tagPlayers || {})) {
    const login = String(player.twitchUsername || player.username || '').trim().toLowerCase();
    if (!/^[a-z0-9_]{1,25}$/.test(login)) continue;
    if (login !== channel && (String(player.lastSeenChannel || '').replace(/^#/, '').toLowerCase() !== channel
      || !Number(player.lastChatAt) || now - Number(player.lastChatAt) > ACTIVE_CHAT_MS)) continue;
    chatters.set(login, { login, name: String(player.displayName || player.twitchUsername || login).slice(0, 80), userId: String(player.twitchId || player.id || '').replace(/^user_/, '').slice(0, 80) });
  }
  // Include the command sender even before their activity write reaches disk.
  chatters.set(username, { login: username, name: displayName, userId: String(userId || '').slice(0, 80) });
  return [...chatters.values()].slice(-1000);
}

export async function runChatTagCheckin(state: AppState, input: { channel: string; username: string; userId: unknown; displayName: string; messageId?: string }) {
  try {
    const response = await fetch(STREAMWEAVER_URL + '/api/internal/chat-tag/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bot-secret': getStreamweaverSecret() },
      body: JSON.stringify({
        channel: input.channel, username: input.username,
        requestId: input.messageId || randomUUID(),
        chatters: checkinChatters(state, input.channel, input.username, input.userId, input.displayName),
      }),
      signal: AbortSignal.timeout(90_000),
    });
    const body = await response.json().catch(() => ({}));
    const result = body.data || body;
    if (!response.ok || typeof result.reply !== 'string') throw Error('Check-in service returned ' + response.status);
    return {
      handled: true,
      reply: result.reply,
      ...(!result.duplicate && result.payload ? { overlayEvent: { type: 'bot-message', message: result.reply, payload: { checkin: result.payload } } } : {}),
    };
  } catch (error) {
    console.error('[ChatTag Checkin] Service failed', error);
    return { handled: true, reply: '@' + input.displayName + ', Space Mountain check-in is unavailable right now. Please try again.' };
  }
}
