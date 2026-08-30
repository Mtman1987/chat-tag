import { notFound } from 'next/navigation';
import { NebulaGameplayCapture } from '@/components/nebula-gameplay-capture';
import { getGameHubGame } from '@/lib/game-hub-registry';

export const dynamic = 'force-dynamic';

export default async function NebulaGameplayCapturePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const game = getGameHubGame(gameId);
  if (!game) notFound();
  return <NebulaGameplayCapture game={game} />;
}
