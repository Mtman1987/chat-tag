'use client';

import { Rocket, Orbit, Settings, Info, LogIn, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from './ui/button';
import { ActivityFeed } from './activity-feed';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';
import { useSession } from '@/contexts/session-context';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/overlay', label: 'Overlay' },
  { href: '/quackverse', label: 'Quackverse' },
  { href: '/quackverse-command', label: 'Quackverse-Command' },
  { href: '/quackverse-preview', label: 'Quackverse-Preview' },
  { href: '/quackverse-guide', label: 'Quackverse-Guide' },
  { href: '/settings', label: 'Settings' },
];

export function Header() {
  const { user, isUserLoading, logout } = useSession();
  const pathname = usePathname();

  return (
    <header className="relative z-20 border-b border-white/10 bg-slate-950/55 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 px-4 py-5 md:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,hsl(var(--primary)),hsl(var(--accent)))] shadow-[0_10px_30px_rgba(34,211,238,0.2)]">
              <Rocket className="h-5 w-5 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-headline text-2xl font-bold tracking-wide text-white">Chat-Tag</span>
                <Orbit className="h-5 w-5 text-cyan-300" />
              </div>
              <p className="text-sm text-slate-400">Creator overlays, tags, commands and Quackverse controls.</p>
            </div>
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            <ActivityFeed />

            {!isUserLoading && (
              user ? (
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1.5">
                  <Avatar className="h-8 w-8 border border-white/10">
                    <AvatarImage src={user.avatarUrl || undefined} alt={user.twitchUsername} />
                    <AvatarFallback>{user.twitchUsername?.charAt(0)?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm font-medium text-slate-100 sm:inline">{user.twitchUsername}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={logout}
                    title="Logout"
                    className="h-8 w-8 rounded-full text-slate-300 hover:bg-white/10 hover:text-white"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
                  onClick={() => {
                    window.location.href = '/api/auth/twitch';
                  }}
                >
                  <LogIn className="mr-2 h-4 w-4" /> Login
                </Button>
              )
            )}

            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="icon" className="rounded-full text-slate-300 hover:bg-white/10 hover:text-white">
                <Link href="/about">
                  <Info className="h-5 w-5" />
                  <span className="sr-only">About/Rules</span>
                </Link>
              </Button>
              <Button asChild variant="ghost" size="icon" className="rounded-full text-slate-300 hover:bg-white/10 hover:text-white">
                <Link href="/settings">
                  <Settings className="h-5 w-5" />
                  <span className="sr-only">Settings</span>
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <nav className="flex flex-wrap gap-2">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-full border px-4 py-2 text-sm font-medium transition',
                  active
                    ? 'border-cyan-300/35 bg-cyan-300/15 text-cyan-100 shadow-[0_0_0_1px_rgba(34,211,238,0.1)]'
                    : 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/10 hover:text-white'
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
