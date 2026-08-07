'use client';

import { LogIn, LogOut, Orbit, Settings, Users } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from './ui/button';
import { ActivityFeed } from './activity-feed';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { useSession } from '@/contexts/session-context';
import { isClientAdminUsername } from '@/lib/client-admin';
import { cn } from '@/lib/utils';

const primaryNavItems = [
  { href: '/', label: 'Home' },
  { href: '/messages', label: 'Messages' },
  { href: '/overlay', label: 'Overlay' },
  { href: '/about', label: 'About' },
];

export function Header() {
  const { user, isUserLoading, logout } = useSession();
  const pathname = usePathname();
  const isAdmin = isClientAdminUsername(user?.twitchUsername);
  const navItems = isAdmin
    ? [...primaryNavItems, { href: '/settings', label: 'Settings' }]
    : primaryNavItems;

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/75 backdrop-blur-xl" data-workspace-topbar>
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-3 px-4 py-3 md:px-8">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <div className="relative h-12 w-36 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-slate-950/70 shadow-[0_8px_24px_rgba(34,211,238,0.16)]">
              <Image src="/brand/chat-tag-logo.png" alt="Chat Tag" fill priority className="object-contain p-1.5" />
            </div>
            <div className="hidden min-w-0 lg:block">
              <div className="flex items-center gap-2">
                <span className="font-headline text-xl font-bold tracking-wide text-white">Chat-Tag</span>
                <Orbit className="h-4 w-4 text-cyan-300" />
              </div>
              <p className="truncate text-xs text-slate-400">Tags, live members, overlays, and Quackverse.</p>
            </div>
          </Link>

          <div className="flex min-w-0 items-center justify-end gap-2">
            <ActivityFeed />

            {!isUserLoading && (
              user ? (
                <div className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1.5">
                  <Avatar className="h-8 w-8 shrink-0 border border-white/10" data-workspace-avatar>
                    <AvatarImage src={user.avatarUrl || undefined} alt={user.twitchUsername} />
                    <AvatarFallback>{user.twitchUsername?.charAt(0)?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-40 truncate text-sm font-medium text-slate-100 sm:inline">{user.twitchUsername}</span>
                  {user.level !== null && user.xp !== null ? (
                    <span className="hidden rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-xs font-semibold text-cyan-100 xl:inline">
                      LVL {user.level} · {user.xp.toLocaleString()} XP
                    </span>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={logout}
                    title="Logout"
                    className="h-8 w-8 shrink-0 rounded-full text-slate-300 hover:bg-white/10 hover:text-white"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full border-cyan-300/30 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20"
                    onClick={() => {
                      window.location.href = '/api/auth/spmt';
                    }}
                  >
                    <Users className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">Sign in with SPMT</span>
                    <span className="sm:hidden">SPMT</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    title="Continue with Twitch"
                    className="h-9 w-9 rounded-full border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
                    onClick={() => {
                      window.location.href = '/api/auth/twitch';
                    }}
                  >
                    <LogIn className="h-4 w-4" />
                  </Button>
                </div>
              )
            )}
          </div>
        </div>

        <nav
          className="flex w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          data-workspace-tabs
          aria-label="Chat-Tag sections"
        >
          {navItems.map((item) => {
            const active = item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const isSettings = item.href === '/settings';
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex shrink-0 items-center rounded-full border px-4 py-2 text-sm font-medium transition',
                  active
                    ? 'border-cyan-300/35 bg-cyan-300/15 text-cyan-100 shadow-[0_0_0_1px_rgba(34,211,238,0.1)]'
                    : 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/10 hover:text-white',
                )}
              >
                {isSettings && <Settings className="mr-2 h-4 w-4" />}
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
