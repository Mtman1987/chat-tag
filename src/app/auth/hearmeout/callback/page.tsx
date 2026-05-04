'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

function HearMeOutCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  useEffect(() => {
    const code = searchParams.get('code');
    const session = searchParams.get('session');
    const twitchUsername = searchParams.get('twitchUsername');
    const avatarUrl = searchParams.get('avatarUrl');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // If Twitch sent us a code, forward to the API callback for token exchange
    if (code && !session) {
      const params = new URLSearchParams({ code });
      const state = searchParams.get('state');
      if (state) params.set('state', state);
      window.location.href = `/api/auth/hearmeout/callback?${params.toString()}`;
      return;
    }

    if (error) {
      toast({
        variant: "destructive",
        title: "Authentication Error",
        description: errorDescription || "An unknown error occurred during authentication.",
      });
      router.replace('/');
      return;
    }

    if (session && twitchUsername) {
      localStorage.setItem('session', session);
      localStorage.setItem('twitchUsername', twitchUsername);
      if (avatarUrl) localStorage.setItem('twitchAvatar', avatarUrl);
      toast({
        title: 'Login Successful!',
        description: `Welcome, ${twitchUsername}!`,
      });
      window.dispatchEvent(new Event('storage'));
      router.replace('/');
    } else if (!session && !error && !code) {
      toast({
        variant: "destructive",
        title: "Authentication Error",
        description: "The session token was missing. Please try logging in again.",
      });
      router.replace('/');
    }
  }, [searchParams, router, toast]);

  return (
    <div className="flex justify-center items-center min-h-screen">
      <div className="text-2xl font-headline animate-pulse">
        Finalizing login, please wait...
      </div>
    </div>
  );
}

export default function HearMeOutCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-2xl font-headline animate-pulse">
          Loading...
        </div>
      </div>
    }>
      <HearMeOutCallbackContent />
    </Suspense>
  );
}
