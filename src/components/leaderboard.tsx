'use client';

import type { Player } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Trophy, Star, Server, Gem } from "lucide-react";
import { ScrollArea } from "./ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { useState, useEffect } from "react";

interface LeaderboardProps {
  players?: Player[];
}

const rankIcons = [
  <Trophy key="1" className="w-5 h-5 text-yellow-400" />,
  <Star key="2" className="w-5 h-5 text-gray-300 fill-gray-300" />,
  <Star key="3" className="w-5 h-5 text-orange-400 fill-orange-400" />,
];

export function Leaderboard({ players: propPlayers }: LeaderboardProps) {
  const [tagPlayers, setTagPlayers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        const res = await fetch('/api/tag');
        if (res.ok) {
          const data = await res.json();
          console.log('[Leaderboard] Player count:', data.players?.length);
          // Ensure scores are calculated from tags/tagged counts
          const playersWithScores = (data.players || []).map((p: any) => ({
            ...p,
            score: ((p.tags || 0) * 100) - ((p.tagged || 0) * 50)
          }));
          setTagPlayers(playersWithScores);
        }
      } catch (e) {
        console.error('Failed to fetch tag players', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPlayers();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchPlayers, 30000);
    return () => clearInterval(interval);
  }, []);

  const players = tagPlayers.length > 0 ? tagPlayers : (propPlayers || []);
  const sortedPlayers = [...players].filter(p => (p.twitchUsername || p.username)).sort((a, b) => (b.score || 0) - (a.score || 0));
  const rankedPlayers = sortedPlayers.filter(p => (p.twitchUsername || p.username || '').toLowerCase() !== 'mtman1987');

  return (
    <Card className="bg-card/80 backdrop-blur-sm flex flex-col">
      <CardHeader className="flex flex-row items-center gap-2">
        <Trophy className="w-6 h-6 text-primary" />
        <CardTitle className="font-headline">Leaderboard</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow">
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <ScrollArea className="h-56">
              <TooltipProvider>
                <ol className="space-y-3 pr-2">
              {rankedPlayers.map((player, index) => (
                <li key={player.id} className="flex items-center justify-between gap-3 p-2 rounded-md transition-colors hover:bg-accent/50">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-lg w-6 text-center">{index < 3 ? rankIcons[index] : index + 1}</span>
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={player.avatarUrl} alt={player.twitchUsername} data-ai-hint="profile picture" />
                      <AvatarFallback>{player.twitchUsername?.charAt(0) || '?'}</AvatarFallback>
                    </Avatar>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium truncate max-w-[240px]">{player.twitchUsername}</span>
                      {player.isIt && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-red-500 text-red-500">IT</span>
                      )}
                      {(player.offlineImmunity || player.sleepingImmunity) && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-cyan-500 text-cyan-500">AWAY</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Tooltip>
                      <TooltipTrigger>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-[72px] justify-end">
                          <span className="text-green-500">+{player.tags || 0}</span>
                          <span>/</span>
                          <span className="text-red-500">-{player.tagged || 0}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Tags: {player.tags || 0} (+{(player.tags || 0) * 100} pts)</p>
                        <p>Tagged: {player.tagged || 0} (-{(player.tagged || 0) * 50} pts)</p>
                      </TooltipContent>
                    </Tooltip>
                    <span className="font-bold text-primary font-mono w-32 text-right whitespace-nowrap">{(player.score || 0).toLocaleString()} pts</span>
                  </div>
                </li>
              ))}
                </ol>
              </TooltipProvider>
            </ScrollArea>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
