import Link from 'next/link';
import { getGameHubGame } from '@/lib/game-hub-catalog';
import { canonicalJoinCommand } from '@/lib/game-hub-commands';
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
    <main className="cosmic-page max-w-5xl" data-workspace-main>
      <section className="cosmic-card space-y-5">
        <div>
          <div className="cosmic-status">Games Hub · Dynamic rules</div>
          <h1 className="mt-3 font-headline text-3xl font-bold text-white">{channel ? `Rules for #${channel}` : 'Active game rules'}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">This page is generated from the games currently scoped ACTIVE for this Twitch channel. Stopped games are intentionally omitted.</p>
        </div>
        {games.length ? games.map((game) => (
          <article key={game!.id} className="rounded-2xl border border-white/10 bg-black/25 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-headline text-xl text-white">{game!.name}</h2>
              <code className="rounded-full bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">{canonicalJoinCommand(game!)}</code>
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-300">{game!.howToPlay}</p>
            <Link href={`/games/${game!.id}`} className="mt-4 inline-block text-xs font-bold text-cyan-200 no-underline">Leaderboard, players & full commands →</Link>
          </article>
        )) : (
          <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-sm text-slate-400">{channel ? `No Games Hub games are currently ACTIVE for #${channel}.` : 'Add ?channel=streamer to this URL.'}</div>
        )}
      </section>
    </main>
  );
}
