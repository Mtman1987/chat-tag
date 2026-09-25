import { notFound } from 'next/navigation';
import { getGameHubGame } from '@/lib/game-hub-registry';
import { NebulaController } from '@/components/nebula-controller';

export const dynamic = 'force-dynamic';

export default async function NebulaControllerPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const game = getGameHubGame(gameId);
  if (!game) notFound();
  return <NebulaController game={game} />;
}
