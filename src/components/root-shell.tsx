'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Header } from '@/components/header';
import { Starfield } from '@/components/starfield';

type RootShellProps = {
  children: React.ReactNode;
};

function applyThemePreset(preset: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.appTheme = preset || 'cosmic';
}

export function RootShell({ children }: RootShellProps) {
  const pathname = usePathname();
  const isOverlayView =
    /^\/overlay\/[^/]+$/.test(pathname) ||
    pathname === '/quackverse-overlay' ||
    pathname.startsWith('/api/');

  useEffect(() => {
    document.body.classList.toggle('overlay-route', isOverlayView);

    return () => {
      document.body.classList.remove('overlay-route');
    };
  }, [isOverlayView]);

  useEffect(() => {
    if (isOverlayView) return;

    let cancelled = false;

    const loadTheme = async () => {
      try {
        const res = await fetch('/api/settings', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        applyThemePreset(String(data.uiThemePreset || 'cosmic'));
      } catch {
        applyThemePreset('cosmic');
      }
    };

    loadTheme();

    return () => {
      cancelled = true;
    };
  }, [isOverlayView]);

  if (isOverlayView) {
    return <>{children}</>;
  }

  return (
    <div className="cosmic-shell">
      <Starfield />
      <div className="relative z-10 min-h-screen">
        <Header />
        {children}
      </div>
    </div>
  );
}
