
'use client';

import { Rocket, Orbit, Settings, Info, LogIn, LogOut } from "lucide-react";
import Link from "next/link";
import { Button } from "./ui/button";
import { ActivityFeed } from "./activity-feed";
import { Avatar, AvatarImage, AvatarFallback } from "./ui/avatar";
import { useSession } from "@/contexts/session-context";

export function Header() {
  const { user, isUserLoading, logout } = useSession();

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

        {!isUserLoading && (
          user ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.avatarUrl || undefined} alt={user.twitchUsername} />
                <AvatarFallback>{user.twitchUsername?.charAt(0)?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium hidden sm:inline">{user.twitchUsername}</span>
              <Button variant="ghost" size="icon" onClick={logout} title="Logout">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => { window.location.href = '/api/auth/twitch'; }}>
              <LogIn className="mr-2 h-4 w-4" /> Login
            </Button>
          )
        )}

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
