import { cn } from "@/lib/utils";
import { Star } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import type { Player } from "@/lib/types";

interface BingoCellProps {
  phrase: string;
  isCovered: boolean;
  isFreeSpace: boolean;
  claimerId?: string | null;
  players?: Player[];
}

export function BingoCell({ phrase, isCovered, isFreeSpace, claimerId = null, players = [] }: BingoCellProps) {
  const claimer = claimerId ? players.find(p => p.id === claimerId) : null;

  return (
    <div
      className={cn(
        "relative flex items-center justify-center p-2 text-center text-xs sm:text-sm font-medium rounded-md aspect-square overflow-hidden transition-all duration-300 transform-gpu",
        "bg-secondary/50 border-2 border-transparent",
        isCovered ? "bg-primary/30" : "text-foreground",
        !isCovered && "hover:border-primary/50 hover:scale-105 cursor-pointer",
        isCovered && "cursor-not-allowed"
      )}
    >
      <span className={cn("relative z-10 transition-opacity", isCovered && !isFreeSpace && "opacity-60")}>{phrase}</span>
      
      {isCovered && claimer && (
         <div className="absolute inset-0 z-20 flex items-center justify-center">
            <Avatar className="w-10 h-10 border-2 border-primary-foreground/50 shadow-lg">
                <AvatarImage src={claimer.avatarUrl} alt={claimer.twitchUsername} />
                <AvatarFallback>{claimer.twitchUsername.charAt(0)}</AvatarFallback>
            </Avatar>
        </div>
      )}

      {isFreeSpace && (
        <Star className={cn("absolute w-1/3 h-1/3 text-accent/50", isCovered && "text-primary/50")} />
      )}
    </div>
  );
}
