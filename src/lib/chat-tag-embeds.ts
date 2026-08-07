export type ChatTagEmbedStatus = 'info' | 'success' | 'warning' | 'error' | 'pending';

export type ChatTagEmbedField = { name: string; value: string; inline?: boolean };

export type ChatTagEmbedOptions = {
  title: string;
  description?: string;
  status?: ChatTagEmbedStatus;
  fields?: ChatTagEmbedField[];
  thumbnailUrl?: string;
  imageUrl?: string;
  authorName?: string;
  authorIconUrl?: string;
  footerText?: string;
  timestamp?: string;
};

const STATUS_COLORS: Record<ChatTagEmbedStatus, number> = {
  info: 0x00d9ff,
  success: 0x57f287,
  warning: 0xfee75c,
  error: 0xed4245,
  pending: 0x5865f2,
};

function cleanText(value: unknown, fallback = '') {
  return String(value ?? fallback).trim();
}

function validHttpUrl(value: unknown) {
  const raw = cleanText(value);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

export function buildChatTagStandardEmbed(options: ChatTagEmbedOptions) {
  const status = options.status || 'info';
  const authorName = cleanText(options.authorName, 'Chat Tag');
  const authorIconUrl = validHttpUrl(options.authorIconUrl);
  const thumbnailUrl = validHttpUrl(options.thumbnailUrl);
  const imageUrl = validHttpUrl(options.imageUrl);

  return {
    title: cleanText(options.title, 'Chat Tag').slice(0, 256),
    ...(cleanText(options.description) ? { description: cleanText(options.description).slice(0, 4096) } : {}),
    color: STATUS_COLORS[status],
    author: { name: authorName.slice(0, 256), ...(authorIconUrl ? { icon_url: authorIconUrl } : {}) },
    ...(Array.isArray(options.fields) && options.fields.length
      ? { fields: options.fields.slice(0, 25).map((field) => ({
          name: cleanText(field.name, 'Details').slice(0, 256),
          value: cleanText(field.value, '—').slice(0, 1024),
          inline: Boolean(field.inline),
        })) }
      : {}),
    ...(thumbnailUrl ? { thumbnail: { url: thumbnailUrl } } : {}),
    ...(imageUrl ? { image: { url: imageUrl } } : {}),
    footer: { text: cleanText(options.footerText, 'SPMT • Chat Tag').slice(0, 2048) },
    timestamp: options.timestamp || new Date().toISOString(),
  };
}
