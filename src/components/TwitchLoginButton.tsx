'use client';

import React from 'react';
import { Button } from './ui/button';
import { useToast } from '@/hooks/use-toast';

const TwitchLoginButton = () => {
  const { toast } = useToast();

  const handleLogin = () => {
    // This now simply redirects to our own server-side API route
    // which will handle the logic of building the Twitch URL.
    window.location.href = '/api/auth/twitch';
  };

  return (
    <Button onClick={handleLogin} size="lg">
      Login with Twitch
    </Button>
  );
};

export default TwitchLoginButton;
