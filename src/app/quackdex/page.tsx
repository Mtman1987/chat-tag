import { getGameHubGame } from '@/lib/game-hub-registry';
import { NebulaController } from '@/components/nebula-controller';

export const dynamic = 'force-dynamic';

export default function QuackdexPage() {
  const game = getGameHubGame('quackverse')!;
  return <NebulaController game={game} initialTab="Quackdex" />;
}
