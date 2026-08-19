import Link from 'next/link';
import { getGameHubGame } from '@/lib/game-hub-registry';
import { canonicalPlayerCommands, canonicalStreamerCommands } from '@/lib/game-hub-commands';
import { normalizeGameHubChannel, resolveChannelGameIds } from '@/lib/game-hub-state';
import { readAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export default async function ActiveGameRulesPage({
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
          <div className="cosmic-status">Games Hub · Live guide</div>
          <h1 className="mt-3 font-headline text-3xl font-bold text-white">{channel ? `Rules + commands for #${channel}` : 'Active game guide'}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">One page generated from the games currently scoped ACTIVE for this Twitch channel. Stopped games and their commands are intentionally omitted. Chat replies also include a compact fallback before this link in case Twitch suppresses links from an unmodded bot.</p>
        </div>

        <section className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.05] p-4">
          <h2 className="font-headline text-lg text-white">Games Hub commands</h2>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <code className="rounded-full bg-black/30 px-3 py-1.5 text-cyan-100">spmt rules</code>
            <code className="rounded-full bg-black/30 px-3 py-1.5 text-cyan-100">spmt help</code>
            <code className="rounded-full bg-black/30 px-3 py-1.5 text-cyan-100">spmt score</code>
            <code className="rounded-full bg-black/30 px-3 py-1.5 text-cyan-100">spmt leader</code>
            <code className="rounded-full bg-black/30 px-3 py-1.5 text-cyan-100">spmt points</code>
            <code className="rounded-full bg-black/30 px-3 py-1.5 text-cyan-100">spmt pleader</code>
            <code className="rounded-full bg-black/30 px-3 py-1.5 text-cyan-100">spmt games</code>
          </div>
          <div className="mt-4 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
            <p><strong className="text-white">score</strong> — your stats for games ACTIVE in this stream.</p>
            <p><strong className="text-white">leader</strong> — your all-games Games Hub profile.</p>
            <p><strong className="text-white">points</strong> — your spendable Games Points balance and rank.</p>
            <p><strong className="text-white">pleader</strong> — Games Points leaderboard.</p>
          </div>
        </section>

        {games.length ? games.map((game) => {
          const playerCommands = canonicalPlayerCommands(game!);
          const streamerCommands = canonicalStreamerCommands(game!);
          return (
            <article key={game!.id} className="rounded-2xl border border-white/10 bg-black/25 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-headline text-xl text-white">{game!.name}</h2>
                <Link href={`/games/${game!.id}`} className="text-xs font-bold text-cyan-200 no-underline">Leaderboard + players →</Link>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-300">{game!.howToPlay}</p>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-200/70">Player commands</h3>
                  <div className="mt-2 space-y-2">
                    {playerCommands.map((command) => (
                      <div key={`${command.trigger}-${command.description}`} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                        <code className="text-cyan-100">{command.trigger}</code>
                        <p className="mt-1 text-xs leading-5 text-slate-400">{command.description}</p>
                      </div>
                    ))}
                  </div>
                  {game!.chatSignals?.length ? <p className="mt-3 text-xs text-slate-500">Passive input: {game!.chatSignals.join(', ')}.</p> : null}
                </div>

                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-200/70">Streamer / mod controls</h3>
                  <div className="mt-2 space-y-2">
                    {streamerCommands.map((command) => (
                      <div key={command.trigger} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                        <code className="text-emerald-100">{command.trigger}</code>
                        <p className="mt-1 text-xs leading-5 text-slate-400">{command.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          );
        }) : (
          <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-sm text-slate-400">{channel ? `No Games Hub games are currently ACTIVE for #${channel}.` : 'Add ?channel=streamer to this URL.'}</div>
        )}
      </section>
    </main>
  );
}
