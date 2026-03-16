'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { signInWithCustomToken } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useAuth, useFirestore, useFirebaseApp } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const { toast } = useToast();

  useEffect(() => {
    const token = searchParams.get('token');
    const twitchUsername = searchParams.get('twitchUsername');
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

    if (token && auth && firebaseApp && twitchUsername) {
      signInWithCustomToken(auth, token)
        .then(() => {
          toast({
            title: 'Login Successful!',
            description: `Welcome, ${twitchUsername}!`,
          });
          router.replace('/');
        })
        .catch((error) => {
          console.error("Firebase custom sign-in error:", error);
          toast({
            variant: "destructive",
            title: "Login Failed",
            description: error.message || "Could not sign in with Firebase.",
          });
          router.replace('/?error=firebase_login_failed');
        });
    } else if (!token && !error) {
        toast({
            variant: "destructive",
            title: "Authentication Error",
            description: "The authentication token was missing. Please try logging in again.",
          });
        router.replace('/');
    }
  }, [searchParams, auth, firebaseApp, router, toast]);

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
