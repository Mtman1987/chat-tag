'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export function DiscordEmbedPoster() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const { toast } = useToast();

  const gameUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');

  const postEmbed = async () => {
    if (!webhookUrl.trim()) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please enter a Discord webhook URL'
      });
      return;
    }

    setIsPosting(true);
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: gameUrl,
          embeds: [{
            title: '🎮 Astro Twitch Clash',
            description: 'Join the fun! Play Chat Bingo and Tag Game with the community.',
            url: gameUrl,
            color: 0xdb2777,
            fields: [
              {
                name: '🎯 Chat Bingo',
                value: 'Play bingo while watching streams! Mark squares when you see these moments happen.',
                inline: false
              },
              {
                name: '🏷️ Tag Game', 
                value: 'Tag other community members in chat and compete for points!',
                inline: false
              }
            ],
            footer: { text: 'Click the link above to join the games!' },
            timestamp: new Date().toISOString()
          }]
        })
      });

      toast({
        title: 'Success!',
        description: 'Game embed posted to Discord'
      });
      setWebhookUrl('');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to post embed to Discord'
      });
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Share Games to Discord</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="gameUrl">Game URL</Label>
          <Input 
            id="gameUrl"
            value={gameUrl}
            readOnly
            className="bg-muted"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="webhookUrl">Discord Webhook URL</Label>
          <Input
            id="webhookUrl"
            placeholder="https://discord.com/api/webhooks/..."
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
        </div>
        
        <Button 
          onClick={postEmbed}
          disabled={isPosting}
          className="w-full"
        >
          {isPosting ? 'Posting...' : 'Post Game Embed to Discord'}
        </Button>
      </CardContent>
    </Card>
  );
}
