import { redirect } from 'next/navigation';
import { normalizeGameHubChannel } from '@/lib/game-hub-state';

export const dynamic = 'force-dynamic';

export default async function ActiveGameHelpPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string }>;
}) {
  const query = await searchParams;
  const channel = normalizeGameHubChannel(query.channel);
  redirect(channel ? `/games/rules?channel=${encodeURIComponent(channel)}` : '/games/rules');
}
