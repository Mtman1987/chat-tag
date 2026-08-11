'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Gamepad2, MessageCircle, MonitorUp, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Play', icon: Gamepad2 },
  { href: '/messages', label: 'Messages', icon: MessageCircle },
  { href: '/overlay', label: 'Overlay', icon: MonitorUp },
];

export function SuiteSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'relative z-20 hidden h-screen shrink-0 flex-col border-r border-white/10 transition-[width] duration-200 md:flex',
        collapsed ? 'w-16' : 'w-64',
      )}
      data-workspace-sidebar
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <div className={cn('flex h-16 items-center border-b border-white/10 px-3', collapsed ? 'justify-center' : 'justify-between')}>
        <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label="ChatTag home">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/20">
            <Image src="/brand/chat-tag-icon-192.png" alt="ChatTag" fill priority className="object-contain p-1" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-headline text-sm font-bold tracking-wide text-white">ChatTag</div>
              <div className="truncate text-[10px] text-slate-400">Play · Community · Quackverse</div>
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
        <Button variant="ghost" size="icon" onClick={onToggle} className="mx-auto mt-2 h-9 w-9" title="Expand navigation">
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
      )}

      <nav className="flex flex-1 flex-col gap-1 p-2" aria-label="ChatTag suite navigation">
        {navItems.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(`${item.href}/`);
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
      </nav>

      {!collapsed && (
        <div className="border-t border-white/10 px-4 py-4 text-[11px] leading-relaxed text-slate-400">
          Space Mountain workspace
        </div>
      )}
    </aside>
  );
}
