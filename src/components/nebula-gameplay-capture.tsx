'use client';

import type { GameHubGame } from '@/lib/game-hub-registry';
import { BingoCard } from '@/components/bingo-card';
import { ChatTagGame } from '@/components/chat-tag-game';
import { NebulaGameFrame } from '@/components/nebula-game-frame';
import { QuackverseCardGame } from '@/components/quackverse-card-game';

export function NebulaGameplayCapture({ game }: { game: GameHubGame }) {
  let surface: React.ReactNode;

  if (game.sourcePrototype) {
    surface = <NebulaGameFrame game={game} demo title={`${game.name} gameplay capture`} />;
  } else if (game.id === 'chat-tag') {
    surface = <ChatTagGame />;
  } else if (game.id === 'quackverse') {
    surface = <QuackverseCardGame />;
  } else if (game.id === 'bingo') {
    surface = <BingoCard />;
  } else {
    surface = null;
  }

  return (
    <main
      className="relative h-dvh w-dvw overflow-hidden bg-[radial-gradient(circle_at_20%_10%,rgba(34,211,238,.2),transparent_38%),linear-gradient(145deg,#020617,#111827)] text-white"
      data-nebula-gameplay-capture={game.id}
    >
      <div className="absolute inset-0 overflow-hidden">{surface}</div>
      <div className="pointer-events-none absolute left-3 top-3 z-50 rounded-lg border border-cyan-300/30 bg-slate-950/80 px-3 py-2 shadow-2xl backdrop-blur">
        <div className="text-[9px] font-bold uppercase tracking-[.22em] text-cyan-200/70">Nebula Arcade gameplay</div>
        <div className="font-headline text-base font-bold text-white">{game.name}</div>
      </div>
    </main>
  );
}
