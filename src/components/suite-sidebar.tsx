'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  Gamepad2,
  Layers3,
  LibraryBig,
  MessageCircle,
  MonitorUp,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  RefreshCw,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useLiveStreamers } from '@/contexts/live-streamers-context';
import { useSession } from '@/contexts/session-context';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Tag', icon: Gamepad2, exact: true },
  { href: '/games', label: 'Games', icon: LibraryBig },
  { href: '/messages', label: 'Messages', icon: MessageCircle },
  { href: '/overlay', label: 'Tag Overlay', icon: MonitorUp, exact: true },
  { href: '/game-overlays', label: 'Game Overlays', icon: Layers3 },
];

export function SuiteSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const { user } = useSession();
  const { liveStreamers, refreshStreamers, isLoading } = useLiveStreamers();
  const adminActive = pathname === '/settings/game-controls' || pathname.startsWith('/settings/game-controls/');
  const settingsActive = pathname === '/settings';

  return (
    <aside
      className={cn(
        'relative z-20 hidden min-h-screen self-stretch shrink-0 flex-col border-r border-white/10 transition-[width] duration-200 md:flex',
        collapsed ? 'w-16' : 'w-72',
      )}
      data-workspace-sidebar
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <div className={cn('flex h-16 shrink-0 items-center border-b border-white/10 px-3', collapsed ? 'justify-center' : 'justify-between')}>
        <Link href="/games" className="flex min-w-0 items-center gap-2.5" aria-label="ChatTag Games Hub">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/20">
            <Image src="/brand/chat-tag-icon-192.png" alt="ChatTag" fill priority className="object-contain p-1" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-headline text-sm font-bold tracking-wide text-white">ChatTag</div>
              <div className="truncate text-[10px] text-slate-400">Games Hub · Community Arcade</div>
            </div>
          )}
        </Link>
        {!collapsed && (
          <Button variant="ghost" size="icon" onClick={onToggle} className="h-8 w-8 shrink-0" title="Collapse navigation">
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}
      </div>

      {collapsed && (
        <Button variant="ghost" size="icon" onClick={onToggle} className="mx-auto mt-2 h-9 w-9 shrink-0" title="Expand navigation">
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
      )}

      <nav className="flex shrink-0 flex-col gap-1 p-2" aria-label="ChatTag suite navigation">
        {navItems.map((item) => {
          const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex h-11 items-center rounded-xl text-sm font-semibold transition',
                collapsed ? 'justify-center px-0' : 'gap-3 px-3',
                active ? 'bg-primary/15 text-white' : 'text-slate-300 hover:bg-white/[0.07] hover:text-white',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        {user?.isAdmin && (
          <>
            <div className={cn('my-1 border-t border-white/10', collapsed ? 'mx-2' : 'mx-1')} />
            <Link
              href="/settings/game-controls"
              aria-current={adminActive ? 'page' : undefined}
              title={collapsed ? 'Admin' : undefined}
              className={cn(
                'flex h-11 items-center rounded-xl text-sm font-semibold transition',
                collapsed ? 'justify-center px-0' : 'gap-3 px-3',
                adminActive ? 'bg-primary/15 text-white' : 'text-primary hover:bg-primary/10 hover:text-primary',
              )}
            >
              <ShieldCheck className="h-4 w-4 shrink-0" />
              {!collapsed && <span>Admin</span>}
            </Link>
            <Link
              href="/settings"
              aria-current={settingsActive ? 'page' : undefined}
              title={collapsed ? 'Settings' : undefined}
              className={cn(
                'flex h-11 items-center rounded-xl text-sm font-semibold transition',
                collapsed ? 'justify-center px-0' : 'gap-3 px-3',
                settingsActive ? 'bg-primary/15 text-white' : 'text-slate-300 hover:bg-white/[0.07] hover:text-white',
              )}
            >
              <Settings className="h-4 w-4 shrink-0" />
              {!collapsed && <span>Settings</span>}
            </Link>
          </>
        )}
      </nav>

      <section className={cn('flex flex-1 flex-col border-t border-white/10', collapsed ? 'px-1 py-2' : 'px-3 py-3')} aria-label="Live community">
        {!collapsed && (
          <div className="mb-2 flex items-center gap-2 px-1">
            <Radio className="h-3.5 w-3.5 text-emerald-300" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Live community</div>
              <div className="text-[10px] text-slate-500">{isLoading ? 'Checking Twitch…' : `${liveStreamers.length} streaming now`}</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-400 hover:text-white"
              onClick={() => void refreshStreamers()}
              title="Refresh live community"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            </Button>
          </div>
        )}

        <div className="flex-1">
          {liveStreamers.length > 0 ? (
            <div className={cn('space-y-1', collapsed && 'flex flex-col items-center gap-1 space-y-0')}>
              {liveStreamers.map((streamer) => (
                <a
                  key={streamer.id}
                  href={`https://www.twitch.tv/${encodeURIComponent(streamer.username)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={collapsed ? `${streamer.username} — live on Twitch` : undefined}
                  className={cn(
                    'group flex min-w-0 items-center rounded-xl transition hover:bg-white/[0.07]',
                    collapsed ? 'justify-center p-1' : 'gap-2.5 px-2 py-2',
                  )}
                >
                  <div className="relative shrink-0">
                    <Avatar className={cn('border border-emerald-300/35', collapsed ? 'h-8 w-8' : 'h-9 w-9')}>
                      <AvatarImage src={streamer.avatar || undefined} alt={streamer.username} />
                      <AvatarFallback className="text-[10px]">{streamer.username.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-emerald-400" />
                  </div>
                  {!collapsed && (
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-slate-200 group-hover:text-white">{streamer.username}</div>
                      <div className="truncate text-[10px] text-slate-500">{streamer.isSharedChat ? 'Shared chat · Live' : 'Live on Twitch'}</div>
                    </div>
                  )}
                </a>
              ))}
            </div>
          ) : !isLoading && !collapsed ? (
            <div className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-3 text-xs leading-relaxed text-slate-500">
              No configured community channels are live right now.
            </div>
          ) : null}
        </div>
      </section>

      <div className="shrink-0 border-t border-white/10 px-3 pb-20 pt-3 text-[11px] text-slate-400">
        {collapsed ? (
          user?.isAdmin ? <ShieldCheck className="mx-auto h-4 w-4 text-primary" aria-label="Owner session" /> : null
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate">Space Mountain workspace</div>
              {user?.isAdmin && <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Owner connected</div>}
            </div>
            {user?.isAdmin && <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />}
          </div>
        )}
      </div>
    </aside>
  );
}
