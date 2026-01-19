
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Gamepad2, Rocket, Target, Shield, Users, Sparkles } from "lucide-react";
import Link from "next/link";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function AboutPage() {
  return (
    <main className="container mx-auto p-4 md:p-6 max-w-4xl">
      <Card className="bg-card/80 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center items-center gap-4 mb-4">
            <Rocket className="h-10 w-10 text-primary" />
            <h1 className="text-4xl font-headline font-bold">Welcome to Astro Twitch Clash!</h1>
            <Gamepad2 className="h-10 w-10 text-primary" />
          </div>
          <CardDescription className="text-lg">
            An interactive game suite for Twitch communities. Play Chat Bingo and Chat Tag right here, integrated with your favorite streams.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="space-y-4">
            <h2 className="text-2xl font-headline flex items-center gap-2"><Target className="text-primary"/> Chat Tag Rules</h2>
            <p className="text-muted-foreground">
              One player in the community is designated as "It". Their status is clearly marked on their profile within the app. If you're "It", your goal is to tag another player by catching them chatting in a live community member's stream.
            </p>
            <ul className="list-disc list-inside space-y-3 text-muted-foreground">
              <li>When you're "It", use the Community list to find a live streamer.</li>
              <li>If you see another player from the game chat in that stream, you can tag them! Click 'Tag' next to their name in the Chat Tag list and select the stream you saw them in.</li>
              <li>You'll earn <strong>100 points</strong>, and they'll lose <strong>50 points</strong> and become the new "It".</li>
              <li><strong className="text-primary">Tag-Back Prevention:</strong> You cannot tag a player in the same stream where you were just tagged. You must visit a different community stream to make your next tag.</li>
              <li><strong className="text-primary"><Shield className="inline-block h-4 w-4 mr-1"/> Tag Immunity:</strong> After you successfully tag someone, you become immune from being tagged for 15 minutes. Go on the offensive!</li>
              <li>A bot will announce the tag in the streamer's chat for everyone to see!</li>
            </ul>
          </div>
          <div className="space-y-4">
            <h2 className="text-2xl font-headline flex items-center gap-2"><Users className="text-primary"/> Shared Chat Bingo</h2>
            <p className="text-muted-foreground">
              This is a community-wide game of Bingo. Everyone sees the same card, and when one person claims a square, it's claimed for everybody! Work together to complete the card.
            </p>
            <ul className="list-disc list-inside space-y-3 text-muted-foreground">
              <li>The bingo card is shared by all players. When a square is claimed, it's covered by that player's avatar.</li>
              <li>To claim a square, you must witness the phrase/event in a live community stream. Click the square and select the streamer where it happened.</li>
              <li>You can only use a specific streamer's chat to claim <strong>one</strong> square per bingo card.</li>
              <li>Claiming a square earns you <strong>10 points</strong>.</li>
              <li>You can use another player's claimed square to complete your own Bingo.</li>
              <li>The player who claims the final square to complete a row, column, or diagonal gets <strong>BINGO!</strong> and earns a <strong>250 point bonus</strong>.</li>
              <li>After a Bingo is achieved, the board resets with a new set of phrases for everyone.</li>
            </ul>
          </div>

          <Separator />

          <div className="space-y-6">
            <div className="text-center">
                <h2 className="text-2xl font-headline flex items-center justify-center gap-2"><Sparkles className="text-primary"/> Hard Mode (Coming Soon)</h2>
                <p className="text-muted-foreground mt-2">These are planned features that can be toggled on by an admin in the future to add a competitive twist.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              <div className="flex items-center justify-between space-x-2 p-3 rounded-lg bg-secondary/50">
                <Label htmlFor="competitive-bingo" className="flex flex-col space-y-1">
                  <span className="font-medium">Competitive Bingo</span>
                  <span className="font-normal text-muted-foreground text-xs">Squares are "owned" and can be stolen by other players.</span>
                </Label>
                <Switch id="competitive-bingo" disabled />
              </div>
              <div className="flex items-center justify-between space-x-2 p-3 rounded-lg bg-secondary/50">
                <Label htmlFor="point-multiplier" className="flex flex-col space-y-1">
                  <span className="font-medium">Community Point Multiplier</span>
                  <span className="font-normal text-muted-foreground text-xs">Completed bingo cards act as a global score multiplier.</span>
                </Label>
                <Switch id="point-multiplier" disabled />
              </div>
              <div className="flex items-center justify-between space-x-2 p-3 rounded-lg bg-secondary/50">
                <Label htmlFor="end-of-card-scoring" className="flex flex-col space-y-1">
                  <span className="font-medium">End-of-Card Scoring</span>
                  <span className="font-normal text-muted-foreground text-xs">Lose points for squares you're short of a bingo on card reset.</span>
                </Label>
                <Switch id="end-of-card-scoring" disabled />
              </div>
              <div className="flex items-center justify-between space-x-2 p-3 rounded-lg bg-secondary/50">
                <Label htmlFor="dynamic-free-space" className="flex flex-col space-y-1">
                  <span className="font-medium">Dynamic Free Space</span>
                  <span className="font-normal text-muted-foreground text-xs">High-score players must earn their own "Free Space".</span>
                </Label>
                <Switch id="dynamic-free-space" disabled />
              </div>
            </div>
          </div>
          
          <Separator />

          <div className="text-center">
            <h2 className="text-2xl font-headline">Ready to Play?</h2>
            <p className="text-muted-foreground mt-2 mb-4">Sign in and join the fun. See you in the chat!</p>
            <Button asChild size="lg">
              <Link href="/">Start Playing</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
