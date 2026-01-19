
import { Rocket, Orbit, Settings, Info } from "lucide-react";
import Link from "next/link";
import { Button } from "./ui/button";
import { ActivityFeed } from "./activity-feed";

export function Header() {
  return (
    <header className="px-4 lg:px-6 h-16 flex items-center justify-between border-b border-border/50 bg-card/50 backdrop-blur-sm">
      <Link href="/" className="flex items-center gap-2">
        <Rocket className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-headline font-bold tracking-wider text-foreground">
          Astro Twitch Clash
        </h1>
        <Orbit className="h-6 w-6 text-primary" />
      </Link>
      <div className="flex items-center gap-4">
        <ActivityFeed />
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon">
            <Link href="/about">
              <Info className="h-5 w-5" />
              <span className="sr-only">About/Rules</span>
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon">
            <Link href="/settings">
              <Settings className="h-5 w-5" />
              <span className="sr-only">Settings</span>
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
