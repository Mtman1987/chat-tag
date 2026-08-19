import Link from 'next/link';
import { getGameHubGame } from '@/lib/game-hub-registry';
import { canonicalPlayerCommands, canonicalStreamerCommands } from '@/lib/game-hub-commands';
import { normalizeGameHubChannel, resolveChannelGameIds } from '@/lib/game-hub-state';
import { readAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export default async function ActiveGameHelpPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string }>;
}) {
  const query = await searchParams;
  const channel = normalizeGameHubChannel(query.channel);
  const state = await readAppState();
  const games = channel
    ? resolveChannelGameIds(state, channel).map((id) => getGameHubGame(id)).filter(Boolean)
    : [];

  return (
    <main className="cosmic-page max-w-6xl" data-workspace-main>
      <section className="cosmic-card space-y-5">
        <div>
          <div className="cosmic-status">Games Hub · Dynamic help</div>
          <h1 className="mt-3 font-headline text-3xl font-bold text-white">{channel ? `Commands for #${channel}` : 'Active game commands'}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">Only commands for games currently scoped ACTIVE in this channel are shown. Every Games Hub command stays under the <code className="text-cyan-100">spmt</code> prefix.</p>
        </div>
        {games.length ? games.map((game) => (
          <article key={game!.id} className="rounded-2xl border border-white/10 bg-black/25 p-5">
            <h2 className="font-headline text-xl text-white">{game!.name}</h2>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="text-xs font-black uppercase tracking-[.18em] text-cyan-200/70">Players</h3>
                <div className="mt-2 space-y-2">
                  {canonicalPlayerCommands(game!).map((command) => (
                    <div key={command.trigger} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                      <code className="text-cyan-100">{command.trigger}</code>
                      <p className="mt-1 text-xs text-slate-400">{command.description}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-[.18em] text-emerald-200/70">Streamer / mods</h3>
                <div className="mt-2 space-y-2">
                  {canonicalStreamerCommands(game!).map((command) => (
                    <div key={command.trigger} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                      <code className="text-emerald-100">{command.trigger}</code>
                      <p className="mt-1 text-xs text-slate-400">{command.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <Link href={`/games/${game!.id}`} className="mt-4 inline-block text-xs font-bold text-cyan-200 no-underline">Open full game page →</Link>
          </article>
        )) : (
          <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-sm text-slate-400">{channel ? `No Games Hub games are currently ACTIVE for #${channel}.` : 'Add ?channel=streamer to this URL.'}</div>
        )}
      </section>
    </main>
  );
}
