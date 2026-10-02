import type {Metadata} from 'next';
import Script from 'next/script';
import './globals.css';
import './workspace-parity.css';
import { Toaster } from "@/components/ui/toaster";
import { RootShell } from '@/components/root-shell';
import { LiveStreamersProvider } from '@/contexts/live-streamers-context';
import { SessionProvider } from '@/contexts/session-context';
import { SpmtWorkspaceHost } from '@/components/spmt-workspace-host';
import { PersonalOverlayHost } from '@/components/personal-overlay-host';

export const metadata: Metadata = {
  title: 'Nebula Arcade',
  description: 'The Space Mountain community arcade for Twitch streams.',
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
    <html lang="en" className="dark">
      <body className="font-body antialiased min-h-screen relative">
        <Script src="/overlay-chunk-recovery.js" strategy="beforeInteractive" />
        <Script src="https://spmt.live/shared/ecosystem-header.js" data-app="chat-tag" strategy="afterInteractive" />
        <Script src="https://spmt.live/shared/workspace-controller.js" strategy="afterInteractive" />
        <SessionProvider>
          <LiveStreamersProvider>
            <RootShell>{children}</RootShell>
            <PersonalOverlayHost />
            <SpmtWorkspaceHost />
            <Toaster />
          </LiveStreamersProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
