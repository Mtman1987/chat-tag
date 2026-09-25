'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Gamepad2, Radio, Sparkles } from 'lucide-react';
import { GAME_HUB_CATALOG } from '@/lib/game-hub-registry';
import { useLiveStreamers } from '@/contexts/live-streamers-context';
import { useSession } from '@/contexts/session-context';

function normalize(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/^#/, '');
}

export function NebulaControllerBay() {
  const { user } = useSession();
  const { liveStreamers, allCommunityMembers, isLoading } = useLiveStreamers();
  const ownChannel = normalize(user?.twitchUsername);
  const [channel, setChannel] = useState(ownChannel);
  const [gameId, setGameId] = useState('pixelbattle');

  const selectedGame = useMemo(
    () => GAME_HUB_CATALOG.find((game) => game.id === gameId) || GAME_HUB_CATALOG[0],
    [gameId],
  );

  const target = normalize(channel || ownChannel);
  const controllerHref = selectedGame && target
    ? `/games/${selectedGame.id}/controller?channel=${encodeURIComponent(target)}`
    : selectedGame
      ? `/games/${selectedGame.id}/controller`
      : '/games';

  const offlineMembers = allCommunityMembers.filter((member) => !member.isActive);

  return (
    <main className="cosmic-page max-w-7xl" data-workspace-main>
      <section className="cosmic-hero">
        <div className="cosmic-card grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,.8fr)] xl:items-center">
          <div>
            <div className="cosmic-status"><Gamepad2 className="h-3.5 w-3.5" /> Nebula Controller Bay</div>
            <h1 className="cosmic-title mt-3">Pick the stream. Pick the game. Open the controller.</h1>
            <p className="cosmic-subtitle">
              Controllers are the off-stream cockpit for Nebula Arcade: live game surface, private command input, game-specific tools, guides and Commlink without crowding the OBS overlay.
            </p>
          </div>

          <div className="rounded-3xl border border-cyan-300/15 bg-cyan-300/[.05] p-4">
            <div className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-200">Launch controller</div>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-1.5 text-xs text-slate-400">
                Stream
                <select value={channel} onChange={(event) => setChannel(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white">
                  <option value="">{isLoading ? 'Loading community…' : 'Choose a stream…'}</option>
                  {liveStreamers.map((streamer) => (
                    <option key={`live:${streamer.id}`} value={streamer.username}>● {streamer.username} — LIVE</option>
                  ))}
                  {offlineMembers.map((streamer) => (
                    <option key={`member:${streamer.id}`} value={streamer.username}>{streamer.username}</option>
                  ))}
                  {ownChannel && !allCommunityMembers.some((member) => normalize(member.username) === ownChannel) ? (
                    <option value={ownChannel}>{ownChannel} — my channel</option>
                  ) : null}
                </select>
              </label>

              <label className="grid gap-1.5 text-xs text-slate-400">
                Game
                <select value={gameId} onChange={(event) => setGameId(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white">
                  {GAME_HUB_CATALOG.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}
                </select>
              </label>

              <Link href={controllerHref} className="rounded-xl bg-cyan-300 px-4 py-3 text-center text-sm font-black text-slate-950 no-underline">
                Open {selectedGame?.shortName || 'Controller'} Controller
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <div className="cosmic-card">
          <div className="mb-4 flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-300" />
            <div>
              <h2 className="font-headline text-xl text-white">Live streams</h2>
              <p className="text-xs text-slate-500">Choose the stream first, then jump straight into any game controller.</p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {liveStreamers.length ? liveStreamers.map((streamer) => (
              <button
                key={streamer.id}
                type="button"
                onClick={() => setChannel(streamer.username)}
                className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${normalize(channel) === normalize(streamer.username) ? 'border-emerald-300/45 bg-emerald-300/10' : 'border-white/10 bg-white/[.025] hover:bg-white/[.06]'}`}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-white">{streamer.username}</div>
                  <div className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-300">Live now</div>
                </div>
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </button>
            )) : (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-slate-500 sm:col-span-2">No community streams are live right now. You can still choose your own or another known channel above.</div>
            )}
          </div>
        </div>

        <aside className="cosmic-card">
          <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-300" /><h2 className="font-headline text-xl text-white">What belongs here</h2></div>
          <div className="mt-4 grid gap-3 text-sm text-slate-300">
            <div className="rounded-2xl border border-white/10 bg-white/[.025] p-3"><strong className="text-white">Play</strong><p className="mt-1 text-xs text-slate-500">See the real game surface and interact without needing the OBS overlay to carry controls.</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[.025] p-3"><strong className="text-white">Control</strong><p className="mt-1 text-xs text-slate-500">Private command console plus game-specific buttons, queues, saves and tools where appropriate.</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[.025] p-3"><strong className="text-white">Communicate</strong><p className="mt-1 text-xs text-slate-500">Commlink stays the shared communications layer instead of inventing another chat transport.</p></div>
          </div>
        </aside>
      </section>

      <section className="mt-6">
        <div className="mb-3">
          <h2 className="font-headline text-2xl text-white">Game controllers</h2>
          <p className="text-sm text-slate-500">Every Nebula title gets a controller entry point now; specialized tabs can deepen over time.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {GAME_HUB_CATALOG.map((game) => {
            const href = target ? `/games/${game.id}/controller?channel=${encodeURIComponent(target)}` : `/games/${game.id}/controller`;
            return (
              <article key={game.id} className="cosmic-card flex min-h-44 flex-col">
                <div className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">{game.category} · {game.runtime}</div>
                <h3 className="mt-1 font-headline text-lg text-white">{game.name}</h3>
                <p className="mt-2 text-xs leading-5 text-slate-400">{game.description}</p>
                <div className="mt-auto pt-4">
                  <Link href={href} className="inline-flex rounded-lg bg-cyan-300 px-3 py-2 text-xs font-black text-slate-950 no-underline">Open Controller</Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
