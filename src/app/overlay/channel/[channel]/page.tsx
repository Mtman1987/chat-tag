import { readAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

function normalize(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/^#/, '');
}

export default async function ChannelChatTagOverlay({
  params,
  searchParams,
}: {
  params: Promise<{ channel: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { channel } = await params;
  const query = await searchParams;
  const login = normalize(channel);
  const state = await readAppState();
  const player = Object.values(state.tagPlayers || {}).find((entry: any) =>
    normalize(entry?.twitchUsername || entry?.username) === login
  ) as any;

  // System channels are valid overlay identities even when they are not present
  // in the legacy tagPlayers registry. Resolve directly instead of silently
  // returning an invisible page.
  const targetId = String(player?.id || login);

  const forwarded = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (Array.isArray(value)) value.forEach((item) => forwarded.append(key, item));
    else if (value != null) forwarded.set(key, value);
  }
  const suffix = forwarded.toString() ? `?${forwarded.toString()}` : '';
  return (
    <iframe
      src={`/overlay/${encodeURIComponent(targetId)}${suffix}`}
      title={`Chat Tag · ${login}`}
      className="h-screen w-screen border-0 bg-transparent"
    />
  );
}
