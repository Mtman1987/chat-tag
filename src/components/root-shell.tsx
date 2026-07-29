'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Header } from '@/components/header';
import { Starfield } from '@/components/starfield';
import type { WorkspaceThemeTokensV1 } from '@spmt/sdk';
import { applyWorkspaceThemeTokens, clearWorkspaceThemeTokens } from '@/lib/workspace-theme';

type RootShellProps = {
  children: React.ReactNode;
};

function applyThemePreset(preset: string) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.appTheme = preset || 'cosmic';
  clearWorkspaceThemeTokens(root);
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

    const loadLocalSettings = async () => {
      try {
        const res = await fetch('/api/settings', { cache: 'no-store' });
        if (!res.ok) return { uiThemePreset: 'cosmic', followWorkspaceTheme: true };
        const data = await res.json();
        return {
          uiThemePreset: String(data.uiThemePreset || 'cosmic'),
          followWorkspaceTheme: data.followWorkspaceTheme !== false,
        };
      } catch {
        return { uiThemePreset: 'cosmic', followWorkspaceTheme: true };
      }
    };

    const loadTheme = async () => {
      const settings = await loadLocalSettings();
      if (settings.followWorkspaceTheme) {
        try {
          const workspace = await fetch('/api/spmt/workspace-theme', { cache: 'no-store', credentials: 'include' });
          if (workspace.ok) {
            const body = await workspace.json().catch(() => ({}));
            if (!cancelled && body?.tokens) {
              applyWorkspaceThemeTokens(document.documentElement, body.tokens as WorkspaceThemeTokensV1);
              return;
            }
          }
        } catch {
          // Fall back to the app-local preset below.
        }
      }
      if (!cancelled) applyThemePreset(settings.uiThemePreset);
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
    <div className="cosmic-shell" data-workspace-shell>
      <Starfield />
      <div className="relative z-10 min-h-screen">
        <Header />
        {children}
      </div>
    </div>
  );
}
