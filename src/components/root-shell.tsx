'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Header } from '@/components/header';
import { Starfield } from '@/components/starfield';

type RootShellProps = {
  children: React.ReactNode;
};

export function RootShell({ children }: RootShellProps) {
  const pathname = usePathname();
  const isOverlayView = /^\/overlay\/[^/]+$/.test(pathname);

  useEffect(() => {
    document.body.classList.toggle('overlay-route', isOverlayView);

    return () => {
      document.body.classList.remove('overlay-route');
    };
  }, [isOverlayView]);

  if (isOverlayView) {
    return <>{children}</>;
  }

  return (
    <>
      <Starfield />
      <div className="relative z-10 min-h-screen bg-background">
        <Header />
        {children}
      </div>
    </>
  );
}
