'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Header } from '@/components/header';
import { Starfield } from '@/components/starfield';
import type { WorkspaceThemeTokensV1 } from '@spmt/sdk';

type RootShellProps = {
  children: React.ReactNode;
};

function applyThemePreset(preset: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.appTheme = preset || 'cosmic';
  clearWorkspaceThemeTokens();
}

function hexToHslComponents(hex: string): string {
  const normalized = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) throw new Error(`Invalid workspace color: ${hex}`);
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return `${Math.round(hue)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`;
}

function clearWorkspaceThemeTokens() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const property of ['--background', '--foreground', '--card', '--card-foreground', '--popover', '--popover-foreground', '--primary', '--accent', '--ring', '--radius']) {
    root.style.removeProperty(property);
  }
  delete root.dataset.workspaceTheme;
  delete root.dataset.workspaceDensity;
  delete root.dataset.workspaceMotion;
}

function applyWorkspaceThemeTokens(tokens: WorkspaceThemeTokensV1) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const background = hexToHslComponents(tokens.background);
  const surface = hexToHslComponents(tokens.surface);
  const text = hexToHslComponents(tokens.text);
  const accent = hexToHslComponents(tokens.accent);
  root.dataset.appTheme = 'workspace';
  root.style.setProperty('--background', background);
  root.style.setProperty('--foreground', text);
  root.style.setProperty('--card', surface);
  root.style.setProperty('--card-foreground', text);
  root.style.setProperty('--popover', surface);
  root.style.setProperty('--popover-foreground', text);
  root.style.setProperty('--primary', accent);
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--ring', accent);
  const radius = ({ sm: '0.25rem', md: '0.5rem', lg: '0.8rem', full: '9999px' } as Record<string, string>)[tokens.radius] || tokens.radius;
  root.style.setProperty('--radius', radius);
  root.dataset.workspaceTheme = tokens.themeId;
  root.dataset.workspaceDensity = tokens.density;
  root.dataset.workspaceMotion = tokens.motion.enabled ? 'on' : 'off';
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

    const loadLocalTheme = async () => {
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

    const loadTheme = async () => {
      try {
        const workspace = await fetch('/api/spmt/workspace-theme', { cache: 'no-store', credentials: 'include' });
        if (workspace.ok) {
          const body = await workspace.json().catch(() => ({}));
          if (!cancelled && body?.tokens) {
            applyWorkspaceThemeTokens(body.tokens as WorkspaceThemeTokensV1);
            return;
          }
        }
      } catch {
        // Fall back to the app-local preset below.
      }
      await loadLocalTheme();
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
