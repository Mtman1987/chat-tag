import type { Metadata } from 'next';
import Link from 'next/link';
import { GAME_HUB_CATALOG } from '@/lib/game-hub-registry';
import { canonicalCommandSummary } from '@/lib/game-hub-commands';
import { NebulaArcadeShowcase } from '@/components/nebula-arcade-showcase';

const showcaseImage = 'https://chat-tag-new.fly.dev/brand/nebula-arcade-games-showcase.gif?v=2';

export const metadata: Metadata = {
  title: 'Nebula Arcade · 20 Games',
  description: 'One bot, one rotating overlay, and 20 equal community games built for live chat.',
  openGraph: {
    title: 'Nebula Arcade · 20 Games',
    description: 'See all 20 live-chat games in the Nebula Arcade rotation.',
    url: 'https://chat-tag-new.fly.dev/games',
    siteName: 'Nebula Arcade',
    type: 'website',
    images: [{ url: showcaseImage, width: 800, height: 450, alt: 'Nebula Arcade 20-game showcase' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nebula Arcade · 20 Games',
    description: 'See all 20 live-chat games in the Nebula Arcade rotation.',
    images: [showcaseImage],
  },
};

export default function GamesHubPage() {
  return (
    <main className="cosmic-page max-w-7xl" data-workspace-main>
      <section className="cosmic-hero">
        <div className="cosmic-card space-y-4">
          <div className="cosmic-status">Nebula Arcade · Space Mountain games</div>
          <h1 className="cosmic-title">One arcade. Twenty equal games.</h1>
          <p className="cosmic-subtitle">
            Every game shares one bot, one rotating overlay, per-game leaderboards and the same public presentation. Chat Tag stays active by default without being treated as the arcade’s permanent flagship.
          </p>
          <div className="flex flex-wrap gap-2 text-xs text-slate-300">
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5">{GAME_HUB_CATALOG.length} equal games</span>
            <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1.5">short direct commands</span>
            <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5">one rotating overlay</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/game-overlays" className="rounded-full bg-[linear-gradient(135deg,hsl(var(--primary)),hsl(var(--accent)))] px-5 py-2.5 text-sm font-bold text-slate-950 no-underline">Open Nebula overlay</Link>
          </div>
        </div>
      </section>

      <section className="mt-6">
        <NebulaArcadeShowcase />
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {GAME_HUB_CATALOG.map((game) => (
          <article key={game.id} className="cosmic-card flex min-h-64 flex-col gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{game.category} · {game.runtime}</div>
              <h2 className="mt-1 font-headline text-xl text-white">{game.name}</h2>
            </div>
            <p className="text-sm leading-6 text-slate-300">{game.description}</p>
            <div className="rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-xs leading-5 text-slate-400">
              {canonicalCommandSummary(game)}
            </div>
            <div className="mt-auto">
              <Link href={`/games/${game.id}`} className="inline-block rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-100 no-underline">Rules, players & leaderboard</Link>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
