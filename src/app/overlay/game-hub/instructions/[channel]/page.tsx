'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type Instruction = {
  visible: boolean;
  game?: {
    id: string;
    name: string;
    howToPlay: string;
    commands: Array<{ trigger: string; description: string }>;
    chatSignals: string[];
  };
};

export default function GameHubInstructionsOverlay() {
  const params = useParams<{ channel: string }>();
  const channel = String(params?.channel || '').trim().toLowerCase();
  const [instruction, setInstruction] = useState<Instruction | null>(null);

  useEffect(() => {
    if (!channel) return;
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/game-hub/instructions?channel=${encodeURIComponent(channel)}`, { cache: 'no-store' });
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled) setInstruction(body.instruction || null);
      } catch {}
    }
    void load();
    const timer = window.setInterval(() => void load(), 1000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [channel]);

  const game = instruction?.visible ? instruction.game : null;
  if (!game) return <main className="min-h-screen bg-transparent" data-nebula-instructions="hidden" />;

  return (
    <main className="grid min-h-screen place-items-center bg-transparent p-4 text-white" data-nebula-instructions={game.id}>
      <section className="w-full max-w-3xl rounded-3xl border border-cyan-200/25 bg-slate-950/90 p-6 shadow-2xl backdrop-blur-xl">
        <div className="text-[10px] font-black uppercase tracking-[.24em] text-cyan-200/70">Nebula Arcade · How to play</div>
        <h1 className="mt-2 text-3xl font-black text-white">{game.name}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-200">{game.howToPlay}</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {game.commands.map((command) => (
            <div key={`${command.trigger}-${command.description}`} className="rounded-xl border border-white/10 bg-white/[.04] p-3">
              <code className="font-bold text-cyan-100">{command.trigger}</code>
              <p className="mt-1 text-xs leading-5 text-slate-400">{command.description}</p>
            </div>
          ))}
        </div>
        {game.chatSignals.length > 0 && <p className="mt-4 text-xs text-slate-400"><strong className="text-white">Normal chat also plays:</strong> {game.chatSignals.join(', ')}.</p>}
      </section>
    </main>
  );
}
