import Link from 'next/link';
import { GAME_HUB_CATALOG, gameHubCommandSummary } from '@/lib/game-hub-catalog';

const statusLabel = {
  live: 'Live now',
  'prototype-ready': 'Prototype ready',
  reconstructing: 'Backend rebuild',
} as const;

export default function GamesHubPage() {
  const live = GAME_HUB_CATALOG.filter((game) => game.status === 'live');
  const archive = GAME_HUB_CATALOG.filter((game) => game.status !== 'live');

  return (
    <main className="cosmic-page max-w-7xl" data-workspace-main>
      <section className="cosmic-hero">
        <div className="cosmic-card space-y-4">
          <div className="cosmic-status">Space Mountain Games Hub</div>
          <h1 className="cosmic-title">One chat. A whole arcade.</h1>
          <p className="cosmic-subtitle">
            Chat Tag and Quackverse stay first-class games. The archived Social Stream prototypes are now a canonical catalog that can share the same monitored Twitch chat and modular overlay system.
          </p>
          <div className="flex flex-wrap gap-2 text-xs text-slate-300">
            <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5">{live.length} established games</span>
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5">{archive.length} archived games cataloged</span>
            <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1.5">1 shared chat event bus</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/overlay/games" className="rounded-full bg-[linear-gradient(135deg,hsl(var(--primary)),hsl(var(--accent)))] px-5 py-2.5 text-sm font-bold text-slate-950 no-underline">
              Build game overlays
            </Link>
            <Link href="/" className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-slate-100 no-underline">
              Play Chat Tag
            </Link>
            <Link href="/quackverse" className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-slate-100 no-underline">
              Open Quackverse
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {GAME_HUB_CATALOG.map((game) => (
          <article key={game.id} className="cosmic-card flex min-h-64 flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{game.category} · {game.runtime}</div>
                <h2 className="mt-1 font-headline text-xl text-white">{game.name}</h2>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${game.status === 'live' ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-200' : 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100'}`}>
                {statusLabel[game.status]}
              </span>
            </div>
            <p className="text-sm leading-6 text-slate-300">{game.description}</p>
            <div className="rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-xs leading-5 text-slate-400">
              {gameHubCommandSummary(game)}
            </div>
            <div className="mt-auto flex flex-wrap gap-2">
              <Link href={`/games/${game.id}`} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-100 no-underline">How to play</Link>
              {game.nativePath && <Link href={game.nativePath} className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-bold text-primary no-underline">Open game</Link>}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
