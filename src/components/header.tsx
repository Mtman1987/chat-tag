'use client';

import { Gamepad2, LogIn, LogOut, MessageCircle, MonitorUp, ShieldCheck, Users } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from './ui/button';
import { ActivityFeed } from './activity-feed';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { useSession } from '@/contexts/session-context';
import { cn } from '@/lib/utils';

const primaryNavItems = [
  { href: '/', label: 'Play', icon: Gamepad2 },
  { href: '/messages', label: 'Messages', icon: MessageCircle },
  { href: '/overlay', label: 'Overlay', icon: MonitorUp },
];

export function Header() {
  const { user, isUserLoading, logout } = useSession();
  const pathname = usePathname();
  const isAdminRoute = pathname === '/settings/game-controls' || pathname.startsWith('/settings/game-controls/');
  const isSettingsRoute = pathname === '/settings';
  const sectionTitle = isAdminRoute
    ? 'Admin'
    : isSettingsRoute
      ? 'Settings'
      : pathname === '/messages' || pathname.startsWith('/messages/')
        ? 'Messages'
        : pathname === '/overlay' || pathname.startsWith('/overlay/')
          ? 'Overlay'
          : 'Play';

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl" data-workspace-topbar>
      <div className="mx-auto flex w-full max-w-[1500px] items-center gap-3 px-3 py-2 sm:px-5 md:px-6">
        <Link href="/" className="flex min-w-0 shrink-0 items-center gap-2.5 md:hidden" aria-label="ChatTag home">
          <div className="relative h-10 w-24 overflow-hidden rounded-lg border border-white/10 bg-slate-950/70 shadow-[0_8px_24px_rgba(34,211,238,0.14)] sm:h-11 sm:w-28">
            <Image src="/brand/chat-tag-logo.png" alt="ChatTag" fill priority className="object-contain p-1" />
          </div>
        </Link>

        <div className="hidden min-w-0 flex-1 md:block">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Space Mountain workspace</p>
          <h1 className="truncate font-headline text-base font-bold tracking-wide text-white">{sectionTitle}</h1>
        </div>

        <nav className="ml-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:hidden" data-workspace-tabs aria-label="ChatTag navigation">
          {primaryNavItems.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition',
                  active ? 'bg-cyan-300/15 text-cyan-100' : 'text-slate-300 hover:bg-white/[0.07] hover:text-white',
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5">
          <ActivityFeed />
          {user?.isAdmin && (
            <Button
              variant="ghost"
              size="icon"
              asChild
              className="h-9 w-9 rounded-lg border border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
              title="Admin"
            >
              <Link href="/settings/game-controls"><ShieldCheck className="h-4 w-4" /></Link>
            </Button>
          )}

          {!isUserLoading && (
            user ? (
              <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] p-1">
                <Avatar className="h-8 w-8 shrink-0" data-workspace-avatar>
                  <AvatarImage src={user.avatarUrl || undefined} alt={user.twitchUsername} />
                  <AvatarFallback>{user.twitchUsername?.charAt(0)?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="hidden min-w-0 sm:block">
                  <div className="max-w-28 truncate text-xs font-semibold text-slate-100">{user.twitchUsername}</div>
                  {user.isAdmin ? (
                    <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary"><ShieldCheck className="h-3 w-3" />Owner</div>
                  ) : user.level !== null ? (
                    <div className="text-[10px] text-cyan-200/75">Level {user.level}</div>
                  ) : null}
                </div>
                <Button variant="ghost" size="icon" onClick={logout} title="Logout" className="h-8 w-8 rounded-md text-slate-400 hover:bg-white/10 hover:text-white">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg border-cyan-300/25 bg-cyan-300/10 px-3 text-cyan-100 hover:bg-cyan-300/20"
                  onClick={() => { window.location.href = '/api/auth/spmt'; }}
                >
                  <Users className="mr-1.5 h-4 w-4" />
                  <span className="hidden sm:inline">Sign in</span><span className="sm:hidden">SPMT</span>
                </Button>
                <Button variant="ghost" size="icon" title="Continue with Twitch" className="h-9 w-9 rounded-lg text-slate-300 hover:bg-white/10" onClick={() => { window.location.href = '/api/auth/twitch'; }}>
                  <LogIn className="h-4 w-4" />
                </Button>
              </div>
            )
          )}
        </div>
      </div>
    </header>
  );
}
