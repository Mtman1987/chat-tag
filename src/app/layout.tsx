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
  title: 'Chat Tag',
  description: 'Game system and community tools for Twitch streams.',
  manifest: '/manifest.json',
  icons: {
    icon: '/brand/chat-tag-icon-192.png',
    apple: '/brand/chat-tag-icon-192.png',
    shortcut: '/favicon.ico',
  },
};

export const viewport = {
  themeColor: '#8ac84a',
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
