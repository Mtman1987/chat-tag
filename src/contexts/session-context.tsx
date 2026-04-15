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
    function loadSession() {
      const username = localStorage.getItem('twitchUsername');
      const avatar = localStorage.getItem('twitchAvatar');
      if (username) {
        setUser({ twitchUsername: username, avatarUrl: avatar || '' });
      } else {
        setUser(null);
      }
      setIsUserLoading(false);
    }

    loadSession();
    window.addEventListener('storage', loadSession);
    return () => window.removeEventListener('storage', loadSession);
  }, []);

  const logout = () => {
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
