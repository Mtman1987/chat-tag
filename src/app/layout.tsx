
import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { Starfield } from '@/components/starfield';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { Header } from '@/components/header';
import { LiveStreamersProvider } from '@/contexts/live-streamers-context';

export const metadata: Metadata = {
  title: 'Astro Twitch Clash',
  description: 'Bingo and Chat Tag for Twitch Streams',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Roboto:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased min-h-screen bg-background relative">
        <FirebaseClientProvider>
          <LiveStreamersProvider>
            <Starfield />
            <div className="relative z-10">
              <Header />
              {children}
            </div>
            <Toaster />
          </LiveStreamersProvider>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
