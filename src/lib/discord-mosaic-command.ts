import { parseMosaicPaintCommand, parseMosaicBrushCommand, parseMosaicViewCommand, parseMosaicRevealCommand } from '@/lib/nebula-mosaic';

export function resolveDiscordMosaicTarget(state: any, discordChannelId: string, message: string): { channel: string; ambiguous: boolean } | null {
  const payload = message.replace(/^!?@?spmt(?:\s+|$)/i, '').trim();
  const isMosaic = /^(?:mosaic|pixel|pixelbattle)(?:\s+|$)/i.test(payload)
    || parseMosaicPaintCommand(message) !== null
    || parseMosaicBrushCommand(message) !== null
    || parseMosaicViewCommand(message) !== null
    || Boolean(parseMosaicRevealCommand(message));
  if (!isMosaic) return null;
  const channels = [...new Set<string>(Object.entries(state.discordWebhooks || {})
    .filter(([key, value]: [string, any]) => key.startsWith('nebula-game:')
      && value?.gameId === 'pixelbattle' && value.discordChannelId === discordChannelId)
    .map(([, value]: [string, any]) => String(value.channel || '').trim().toLowerCase())
    .filter(Boolean))];
  return channels.length ? { channel: channels[0], ambiguous: channels.length > 1 } : null;
}
