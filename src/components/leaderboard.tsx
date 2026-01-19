
import type { Player } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Trophy, Star, Server, Gem } from "lucide-react";
import { ScrollArea } from "./ui/scroll-area";
import { useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { doc } from "firebase/firestore";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

interface LeaderboardProps {
  players: Player[];
}

type GameSettings = {
  bingoCardsCompleted?: number;
};

const rankIcons = [
  <Trophy key="1" className="w-5 h-5 text-yellow-400" />,
  <Star key="2" className="w-5 h-5 text-gray-300 fill-gray-300" />,
  <Star key="3" className="w-5 h-5 text-orange-400 fill-orange-400" />,
];

export function Leaderboard({ players }: LeaderboardProps) {
  const sortedPlayers = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
  const firestore = useFirestore();

  const settingsDocRef = useMemoFirebase(
    () => (firestore ? doc(firestore, 'gameSettings', 'default') : null),
    [firestore]
  );
  const { data: settings } = useDoc<GameSettings>(settingsDocRef);
  const bingoCardsCompleted = settings?.bingoCardsCompleted ?? 0;

  return (
    <Card className="bg-card/80 backdrop-blur-sm flex flex-col">
      <CardHeader className="flex flex-row items-center gap-2">
        <Trophy className="w-6 h-6 text-primary" />
        <CardTitle className="font-headline">Leaderboard</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow">
        <ScrollArea className="h-56">
          <TooltipProvider>
            <ol className="space-y-3">
              {sortedPlayers.map((player, index) => (
                <li key={player.id} className="flex items-center justify-between gap-3 p-2 rounded-md transition-colors hover:bg-accent/50">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-lg w-6 text-center">{index < 3 ? rankIcons[index] : index + 1}</span>
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={player.avatarUrl} alt={player.twitchUsername} data-ai-hint="profile picture" />
                      <AvatarFallback>{player.twitchUsername.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium truncate">{player.twitchUsername}</span>
                  </div>
                  <div className="flex items-center gap-4">
                     <Tooltip>
                        <TooltipTrigger>
                           <div className="flex items-center gap-1.5 font-mono">
                              <Gem className="w-4 h-4 text-cyan-400"/>
                              <span className="font-bold text-cyan-400">{ (player.communityPoints || 0).toLocaleString()}</span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Community Points</p>
                        </TooltipContent>
                      </Tooltip>
                    <span className="font-bold text-primary font-mono w-20 text-right">{(player.score || 0).toLocaleString()} pts</span>
                  </div>
                </li>
              ))}
            </ol>
          </TooltipProvider>
        </ScrollArea>
      </CardContent>
      <CardFooter className="border-t pt-4">
        <div className="flex items-center justify-center w-full gap-2 text-muted-foreground">
            <Server className="w-5 h-5 text-primary" />
            <p className="font-headline">Community Bingos: <span className="font-bold text-foreground">{bingoCardsCompleted}</span></p>
        </div>
      </CardFooter>
    </Card>
  );
}
