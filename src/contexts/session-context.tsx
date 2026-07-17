'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface SessionUser {
  twitchUsername: string;
  avatarUrl: string;
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

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isUserLoading, setIsUserLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const response = await fetch('/api/user-profile', { credentials: 'same-origin' });
        const data = response.ok ? await response.json() : null;
        const twitch = data?.twitch;

        if (twitch?.name) {
          localStorage.setItem('twitchUsername', twitch.name);
          localStorage.setItem('twitchAvatar', twitch.avatar || '');
          if (!cancelled) {
            setUser({ twitchUsername: twitch.name, avatarUrl: twitch.avatar || '' });
          }
          return;
        }
      } catch {
        // A cached profile may keep the shell readable during a short outage,
        // but it is never treated as authentication authority.
        const username = localStorage.getItem('twitchUsername');
        const avatar = localStorage.getItem('twitchAvatar');
        if (username && !cancelled) {
          setUser({ twitchUsername: username, avatarUrl: avatar || '' });
          return;
        }
      }

      if (!cancelled) {
        localStorage.removeItem('session');
        localStorage.removeItem('twitchUsername');
        localStorage.removeItem('twitchAvatar');
        setUser(null);
        setIsUserLoading(false);
      }
    }

    void loadSession().finally(() => {
      if (!cancelled) {
        setIsUserLoading(false);
      }
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
