'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface SessionUser {
  twitchUsername: string;
  avatarUrl: string;
  xp: number | null;
  level: number | null;
  isAdmin: boolean;
  role: 'owner' | 'member';
}

interface SessionContextState {
  user: SessionUser | null;
  isUserLoading: boolean;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextState>({
  user: null,
  isUserLoading: true,
  logout: async () => {},
});

const SESSION_CACHE_KEY = 'spmt.cache.v1.chat-tag.session';

type CachedSessionEnvelope = {
  version: 1;
  savedAt: string;
  user: Pick<SessionUser, 'twitchUsername' | 'avatarUrl' | 'xp' | 'level'>;
};

function readCachedUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = JSON.parse(localStorage.getItem(SESSION_CACHE_KEY) || 'null') as CachedSessionEnvelope | null;
    if (!cached || cached.version !== 1 || !cached.user?.twitchUsername) return null;
    return {
      twitchUsername: cached.user.twitchUsername,
      avatarUrl: cached.user.avatarUrl || '',
      xp: Number.isFinite(cached.user.xp) ? cached.user.xp : null,
      level: Number.isFinite(cached.user.level) ? cached.user.level : null,
      // Cached display data is never administrator authority.
      isAdmin: false,
      role: 'member',
    };
  } catch {
    return null;
  }
}

function cacheUser(user: SessionUser) {
  try {
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      user: {
        twitchUsername: user.twitchUsername,
        avatarUrl: user.avatarUrl,
        xp: user.xp,
        level: user.level,
      },
    } satisfies CachedSessionEnvelope));
  } catch {}
}

function clearCachedUser() {
  try { localStorage.removeItem(SESSION_CACHE_KEY); } catch {}
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const initialUser = typeof window !== 'undefined' ? readCachedUser() : null;
  const [user, setUser] = useState<SessionUser | null>(initialUser);
  const [isUserLoading, setIsUserLoading] = useState(!initialUser);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const response = await fetch('/api/user-profile', { credentials: 'same-origin', cache: 'no-store' });
        const data = response.ok ? await response.json() : null;
        const twitch = data?.twitch;

        if (twitch?.name) {
          localStorage.setItem('twitchUsername', twitch.name);
          localStorage.setItem('twitchAvatar', twitch.avatar || '');
          if (!cancelled) {
            const isAdmin = data?.isAdmin === true;
            const nextUser: SessionUser = {
              twitchUsername: twitch.name,
              avatarUrl: twitch.avatar || '',
              xp: null,
              level: null,
              isAdmin,
              role: isAdmin ? 'owner' : 'member',
            };
            cacheUser(nextUser);
            setUser(nextUser);
            void fetch('/api/spmt/xp', { credentials: 'same-origin', cache: 'no-store' })
              .then((xpResponse) => xpResponse.ok ? xpResponse.json() : null)
              .then((xpData) => {
                const xp = Number(xpData?.xp);
                const level = Number(xpData?.level);
                if (cancelled || !Number.isFinite(xp) || !Number.isFinite(level)) return;
                setUser((current) => {
                  if (!current) return current;
                  const updated = {
                    ...current,
                    xp: Math.max(0, Math.trunc(xp)),
                    level: Math.max(1, Math.trunc(level)),
                  };
                  cacheUser(updated);
                  return updated;
                });
              })
              .catch(() => {});
          }
          return;
        }

        // Only an authoritative auth rejection clears the restored shell. A 5xx
        // or other transient response leaves the last-known display state intact.
        if (response.status !== 401 && response.status !== 403) return;
      } catch {
        return;
      }

      if (!cancelled) {
        localStorage.removeItem('session');
        localStorage.removeItem('twitchUsername');
        localStorage.removeItem('twitchAvatar');
        clearCachedUser();
        setUser(null);
      }
    }

    void loadSession().finally(() => {
      if (!cancelled) setIsUserLoading(false);
    });
    window.addEventListener('storage', loadSession);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', loadSession);
    };
  }, []);

  const logout = async () => {
    await fetch('/api/auth/session', { method: 'DELETE', credentials: 'same-origin' }).catch(() => null);
    localStorage.removeItem('session');
    localStorage.removeItem('twitchUsername');
    localStorage.removeItem('twitchAvatar');
    clearCachedUser();
    setUser(null);
    window.dispatchEvent(new Event('storage'));
  };

  return (
    <SessionContext.Provider value={{ user, isUserLoading, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
