import type {Metadata} from 'next';
import { Orbitron, Roboto } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { RootShell } from '@/components/root-shell';
import { LiveStreamersProvider } from '@/contexts/live-streamers-context';
import { SessionProvider } from '@/contexts/session-context';

const orbitron = Orbitron({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-headline',
});

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'Astro Twitch Clash',
  description: 'Quackverse Space-Force and Chat Tag for Twitch Streams',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${orbitron.variable} ${roboto.variable} dark`}>
      <body className="font-body antialiased min-h-screen relative">
        <SessionProvider>
          <LiveStreamersProvider>
            <RootShell>{children}</RootShell>
            <Toaster />
          </LiveStreamersProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
