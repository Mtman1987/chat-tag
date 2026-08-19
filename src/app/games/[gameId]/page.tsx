import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GAME_HUB_CATALOG, getGameHubGame } from '@/lib/game-hub-catalog';

export function generateStaticParams() {
  return GAME_HUB_CATALOG.map((game) => ({ gameId: game.id }));
}

export default async function GameHubDetailPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const game = getGameHubGame(gameId);
  if (!game) notFound();

  return (
    <main className="cosmic-page max-w-5xl" data-workspace-main>
      <section className="cosmic-card space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="cosmic-status">Games Hub · {game.category}</div>
            <h1 className="mt-3 font-headline text-3xl font-bold text-white md:text-4xl">{game.name}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{game.description}</p>
          </div>
          <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-cyan-100">
            {game.status === 'live' ? 'Live' : 'Prototype reconstruction'}
          </span>
        </div>

        <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
          <h2 className="font-headline text-xl text-white">How to play</h2>
          <p className="mt-2 text-sm leading-7 text-slate-300">{game.howToPlay}</p>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
            <h2 className="font-headline text-lg text-white">Chat controls</h2>
            {game.commands.length ? (
              <div className="mt-3 space-y-2">
                {game.commands.map((command) => (
                  <div key={`${command.trigger}-${command.description}`} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                    <code className="text-cyan-100">{command.trigger}</code>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{command.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-400">
                No dedicated command is required. {game.chatSignals?.length ? `The game reacts to ${game.chatSignals.join(', ')}.` : 'Use the game’s native controls.'}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
            <h2 className="font-headline text-lg text-white">Runtime</h2>
            <dl className="mt-3 grid gap-3 text-sm">
              <div><dt className="text-slate-500">Engine type</dt><dd className="text-slate-200">{game.runtime}</dd></div>
              <div><dt className="text-slate-500">Overlay mode</dt><dd className="text-slate-200">{game.overlayAspect}</dd></div>
              {game.sourcePrototype && <div><dt className="text-slate-500">Recovered from</dt><dd className="font-mono text-xs text-slate-300">{game.sourcePrototype}</dd></div>}
            </dl>
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          {game.nativePath && <Link href={game.nativePath} className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground no-underline">Open {game.shortName}</Link>}
          <Link href="/overlay/games" className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-5 py-2.5 text-sm font-bold text-cyan-100 no-underline">Add to an overlay</Link>
          <Link href="/games" className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-slate-200 no-underline">Back to catalog</Link>
        </div>
      </section>
    </main>
  );
}
