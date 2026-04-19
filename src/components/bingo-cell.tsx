import { cn } from "@/lib/utils";
import { Star } from "lucide-react";

interface BingoCellProps {
  phrase: string;
  isCovered: boolean;
  isFreeSpace: boolean;
}

export function BingoCell({ phrase, isCovered, isFreeSpace }: BingoCellProps) {

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

      {isFreeSpace && (
        <Star className={cn("absolute w-1/3 h-1/3 text-accent/50", isCovered && "text-primary/50")} />
      )}
    </div>
  );
}
