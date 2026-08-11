'use client';

import Link from 'next/link';
import { ArrowLeft, ImageIcon, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChatTagGame } from '@/components/chat-tag-game';
import { QuackverseArtManager } from '@/components/quackverse-art-manager';

export default function GuardedGameControlsPage() {
  return (
    <main className="cosmic-page" data-workspace-main>
      <div className="mx-auto max-w-6xl space-y-5">
        <Card className="rounded-[1.35rem] border-cyan-300/20 bg-cyan-300/[0.05] backdrop-blur-xl">
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">
                <ShieldCheck className="h-4 w-4" />
                SPMT admin guarded
              </div>
              <CardTitle className="font-headline text-2xl">Game Administration</CardTitle>
              <CardDescription className="mt-1">
                ChatTag moderation and Quackverse content tools live here instead of on public player/game surfaces.
              </CardDescription>
            </div>
            <Button asChild variant="secondary" className="shrink-0">
              <Link href="/settings"><ArrowLeft className="mr-2 h-4 w-4" />Back to settings</Link>
            </Button>
          </CardHeader>
        </Card>

        <Card className="rounded-[1.35rem] border-white/10 bg-white/[0.045] p-3 shadow-[0_24px_80px_rgba(3,8,24,0.3)] backdrop-blur-xl sm:p-5">
          <CardContent className="p-0">
            <ChatTagGame adminMode />
          </CardContent>
        </Card>

        <Card className="rounded-[1.35rem] border-white/10 bg-white/[0.045] backdrop-blur-xl">
          <CardHeader>
            <div className="mb-1 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">
              <ImageIcon className="h-4 w-4" />
              Quackverse content
            </div>
            <CardTitle className="font-headline text-xl">Card Art Manager</CardTitle>
            <CardDescription>
              Upload and manage Quackverse card artwork from this guarded admin surface. The public Cards tab remains read-only.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QuackverseArtManager />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
