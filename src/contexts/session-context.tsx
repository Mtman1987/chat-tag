'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface SessionUser {
  twitchUsername: string;
  avatarUrl: string;
}

interface SessionContextState {
  user: SessionUser | null;
  isUserLoading: boolean;
  logout: () => void;
}

const SessionContext = createContext<SessionContextState>({
  user: null,
  isUserLoading: true,
  logout: () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isUserLoading, setIsUserLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      const username = localStorage.getItem('twitchUsername');
      const avatar = localStorage.getItem('twitchAvatar');
      if (username) {
        if (!cancelled) {
          setUser({ twitchUsername: username, avatarUrl: avatar || '' });
          setIsUserLoading(false);
        }
        return;
      }

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
        // Ignore hydration failures and fall back to signed-out state.
      }

      if (!cancelled) {
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

  const logout = () => {
    localStorage.removeItem('session');
    localStorage.removeItem('twitchUsername');
    localStorage.removeItem('twitchAvatar');
    document.cookie = 'session=; Max-Age=0; path=/; SameSite=Lax';
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
