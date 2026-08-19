'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Header } from '@/components/header';
import { Starfield } from '@/components/starfield';
import { SuiteSidebar } from '@/components/suite-sidebar';
import type { WorkspaceThemeTokensV1 } from '@spmt/sdk';
import { applyWorkspaceThemeTokens, clearWorkspaceThemeTokens } from '@/lib/workspace-theme';

type RootShellProps = {
  children: React.ReactNode;
};

const WORKSPACE_REFRESH_MS = 30_000;
const SIDEBAR_STORAGE_KEY = 'chat-tag-suite-sidebar-collapsed';

function applyThemePreset(preset: string) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.appTheme = preset || 'cosmic';
  clearWorkspaceThemeTokens(root);
}

export function RootShell({ children }: RootShellProps) {
  const pathname = usePathname();
  const revisionRef = useRef<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarHydratedRef = useRef(false);
  const isOverlayView =
    /^\/overlay\/[^/]+$/.test(pathname) ||
    pathname.startsWith('/overlay/game-hub/') ||
    pathname === '/quackverse-overlay' ||
    pathname.startsWith('/api/');

  useEffect(() => {
    document.body.classList.toggle('overlay-route', isOverlayView);

    return () => {
      document.body.classList.remove('overlay-route');
    };
  }, [isOverlayView]);

  useEffect(() => {
    if (isOverlayView || sidebarHydratedRef.current) return;
    const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (saved === 'true' || saved === 'false') {
      setSidebarCollapsed(saved === 'true');
      sidebarHydratedRef.current = true;
    }
  }, [isOverlayView]);

  const applySidebarPreference = useCallback(() => {
    if (isOverlayView || sidebarHydratedRef.current) return;
    const canonicalCollapsed = document.documentElement.dataset.workspaceSidebarCollapsed === 'true';
    setSidebarCollapsed(canonicalCollapsed);
    sidebarHydratedRef.current = true;
  }, [isOverlayView]);

  const loadTheme = useCallback(async (quiet = false) => {
    if (isOverlayView) return;
    let settings = { uiThemePreset: 'cosmic', followWorkspaceTheme: true };
    try {
      const localResponse = await fetch('/api/settings', { cache: 'no-store' });
      if (localResponse.ok) {
        const data = await localResponse.json();
        settings = {
          uiThemePreset: String(data.uiThemePreset || 'cosmic'),
          followWorkspaceTheme: data.followWorkspaceTheme !== false,
        };
      }
    } catch {
      // Use the safe local fallback below.
    }

    if (settings.followWorkspaceTheme) {
      try {
        const workspace = await fetch('/api/spmt/workspace-theme', { cache: 'no-store', credentials: 'include' });
        const body = await workspace.json().catch(() => ({}));
        if (workspace.ok && body?.tokens) {
          const revision = Number(body.revision || 0);
          if (revisionRef.current !== revision || !document.documentElement.dataset.workspaceTheme) {
            applyWorkspaceThemeTokens(document.documentElement, body.tokens as WorkspaceThemeTokensV1);
            revisionRef.current = revision;
            window.dispatchEvent(new CustomEvent('spmt-workspace-updated', { detail: body }));
          }
          applySidebarPreference();
          return;
        }
      } catch {
        if (quiet && document.documentElement.dataset.workspaceTheme) return;
      }
    }

    revisionRef.current = null;
    applyThemePreset(settings.uiThemePreset);
    applySidebarPreference();
  }, [applySidebarPreference, isOverlayView]);

  useEffect(() => {
    if (isOverlayView) return;
    void loadTheme();
    const interval = window.setInterval(() => void loadTheme(true), WORKSPACE_REFRESH_MS);
    const onFocus = () => void loadTheme(true);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void loadTheme(true);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isOverlayView, loadTheme]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      sidebarHydratedRef.current = true;
      return next;
    });
  }, []);

  if (isOverlayView) {
    return <>{children}</>;
  }

  return (
    <div className="cosmic-shell flex min-h-screen" data-workspace-shell data-route={pathname}>
      <Starfield />
      <SuiteSidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <div className="relative z-10 min-w-0 flex-1">
        <Header />
        {children}
      </div>
    </div>
  );
}
