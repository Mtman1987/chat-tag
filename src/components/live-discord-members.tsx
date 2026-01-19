'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Users, Eye } from 'lucide-react';

interface LiveMember {
  discordId: string;
  discordUsername: string;
  discordDisplayName: string;
  twitchUsername: string;
  twitchDisplayName: string;
  streamTitle: string;
  gameName: string;
  viewerCount: number;
  thumbnailUrl: string;
}

export function LiveDiscordMembers() {
  const [liveMembers, setLiveMembers] = useState<LiveMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLiveMembers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/discord/live-members');
      
      if (!response.ok) {
        throw new Error('Failed to fetch live members');
      }
      
      const data = await response.json();
      setLiveMembers(data.liveMembers || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveMembers();
    
    // Refresh every 2 minutes
    const interval = setInterval(fetchLiveMembers, 120000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Live Discord Members
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Live Discord Members
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-red-500">
            Error: {error}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchLiveMembers}
              className="ml-2"
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Live Discord Members ({liveMembers.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {liveMembers.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            No Discord members are currently live on Twitch
          </div>
        ) : (
          <div className="space-y-4">
            {liveMembers.map((member) => (
              <div key={member.discordId} className="border rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold">
                        {member.discordDisplayName || member.discordUsername}
                      </h3>
                      <Badge variant="secondary">
                        @{member.twitchUsername}
                      </Badge>
                    </div>
                    
                    <p className="text-sm text-muted-foreground mb-2">
                      {member.streamTitle}
                    </p>
                    
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <Eye className="h-4 w-4" />
                        {member.viewerCount.toLocaleString()} viewers
                      </div>
                      {member.gameName && (
                        <Badge variant="outline">
                          {member.gameName}
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                  >
                    <a
                      href={`https://twitch.tv/${member.twitchUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Watch
                    </a>
                  </Button>
                </div>
                
                {member.thumbnailUrl && (
                  <div className="mt-3">
                    <img
                      src={member.thumbnailUrl.replace('{width}', '320').replace('{height}', '180')}
                      alt={`${member.twitchUsername} stream thumbnail`}
                      className="w-full max-w-xs rounded border"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        
        <div className="mt-4 pt-4 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchLiveMembers}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}