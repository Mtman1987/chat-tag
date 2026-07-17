'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  useEffect(() => {
    const twitchUsername = searchParams.get('twitchUsername');
    const avatarUrl = searchParams.get('avatarUrl');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (error) {
      toast({
        variant: "destructive",
        title: "Authentication Error",
        description: errorDescription || "An unknown error occurred during authentication.",
      });
      router.replace('/');
      return;
    }

    if (twitchUsername) {
      localStorage.setItem('twitchUsername', twitchUsername);
      if (avatarUrl) localStorage.setItem('twitchAvatar', avatarUrl);
      toast({
        title: 'Login Successful!',
        description: `Welcome, ${twitchUsername}!`,
      });
      // Trigger storage event for other tabs/components
      window.dispatchEvent(new Event('storage'));
      router.replace('/');
    } else if (!error) {
      toast({
        variant: "destructive",
        title: "Authentication Error",
        description: "The signed-in profile was missing. Please try logging in again.",
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

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-2xl font-headline animate-pulse">
          Loading...
        </div>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
