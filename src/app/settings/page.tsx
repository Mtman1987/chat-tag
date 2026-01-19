
'use client';

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useFirestore, useDoc, useMemoFirebase, useFirebaseApp } from "@/firebase";
import { doc, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { Share2, AlertTriangle, MessageSquare } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { Player, GameSettings } from "@/lib/types";

const SettingsSchema = z.object({
  twitchClientId: z.string().min(1, "Twitch Client ID is required."),
  twitchClientSecret: z.string().min(1, "Twitch Client Secret is required."),
  discordBotToken: z.string().optional(),
  discordServerId: z.string().optional(),
  twitchBotToken: z.string().optional(),
  discordChannelId: z.string().optional(),
  discordWebhookUrl: z.string().url("Must be a valid webhook URL.").optional().or(z.literal('')),
  discordLeaderboardMessageId: z.string().optional(),
  externalApiUrl: z.string().url("Must be a valid URL.").optional().or(z.literal('')),
  tagSuccessPoints: z.coerce.number().min(0, "Must be a positive number"),
  tagPenaltyPoints: z.coerce.number().min(0, "Must be a positive number"),
  bingoSquarePoints: z.coerce.number().min(0, "Must be a positive number"),
  bingoWinPoints: z.coerce.number().min(0, "Must be a positive number"),
});

type SettingsForm = z.infer<typeof SettingsSchema>;

export default function SettingsPage() {
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const [isTestingWrite, setIsTestingWrite] = useState(false);
  const [isPostingToDiscord, setIsPostingToDiscord] = useState(false);
  
  const settingsDocRef = useMemoFirebase(
    () => (firestore ? doc(firestore, "gameSettings", "default") : null),
    [firestore]
  );
    
  const usersCollection = useMemoFirebase(
    () => (firestore ? doc(firestore, 'users', 'default') : null),
    [firestore]
  );
  
  const { data: playersData } = useDoc<Player>(usersCollection);
  const players = playersData ? [playersData] : [];
  const activePlayers = players?.filter(p => p.isActive) || [];

  const { data: settings, isLoading } = useDoc<SettingsForm>(settingsDocRef);

  const form = useForm<SettingsForm>({
    resolver: zodResolver(SettingsSchema),
    defaultValues: {
      twitchClientId: "",
      twitchClientSecret: "",
      discordBotToken: "",
      discordServerId: "",
      twitchBotToken: "",
      discordChannelId: "",
      discordWebhookUrl: "",
      discordLeaderboardMessageId: "",
      externalApiUrl: "",
      tagSuccessPoints: 100,
      tagPenaltyPoints: 50,
      bingoSquarePoints: 10,
      bingoWinPoints: 250,
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset(settings);
    }
  }, [settings, form]);

  const onSubmit = async (data: SettingsForm) => {
    if (!settingsDocRef) {
        toast({
            variant: "destructive",
            title: "Firestore Not Ready",
            description: "Cannot save settings. Please try again in a moment.",
        });
        return;
    }
    await setDoc(settingsDocRef, data, { merge: true });
    toast({
        title: "Settings saved!",
        description: "Your integration and game settings have been updated.",
    });
  };

  const handleShare = (streamerName: string) => {
    const appUrl = window.location.origin;
    const rulesUrl = `${appUrl}/about`;
    toast({
      title: "Sharing in Twitch Chat",
      description: `Your bot would now post in ${streamerName}'s chat: "Want to join the fun? Check out the rules and sign up here: ${rulesUrl}"`,
    });
  }

 const handleTestWrite = async () => {
    if (!firestore || !firebaseApp) {
      toast({
        variant: "destructive",
        title: "Firestore Not Ready",
        description: "Please wait a moment and try again.",
      });
      return;
    }
    setIsTestingWrite(true);
    try {
      const testDocRef = doc(firestore, "tests", "write-test");
      await setDoc(testDocRef, { status: "ok", timestamp: new Date() });
      toast({
        title: "Firestore Write Test Successful!",
        description: "Check the /tests/write-test document in your Firestore database.",
      });
    } catch (error: any) {
      console.error("Firestore Write Test Failed:", error);
      toast({
        variant: "destructive",
        title: "Firestore Write Test Failed",
        description: error.message || "Could not write to the database. Check console and security rules.",
      });
    } finally {
      setIsTestingWrite(false);
    }
  };

  const handlePostToDiscord = async () => {
    const webhookUrl = form.getValues("discordWebhookUrl");
    if (!webhookUrl) {
      toast({
        variant: "destructive",
        title: "Missing Webhook URL",
        description: "Please set the Discord Webhook URL in the Bot Integrations section first."
      });
      return;
    }
    if (!settingsDocRef) {
        toast({
            variant: "destructive",
            title: "Firestore Not Ready",
            description: "Cannot save message ID. Please try again.",
        });
        return;
    }

    setIsPostingToDiscord(true);
    toast({
      title: "Posting to Discord...",
      description: "Sending initial leaderboard to your webhook."
    });
    
    try {
        const urlWithWait = new URL(webhookUrl);
        urlWithWait.searchParams.append('wait', 'true');

        const backendResponse = await fetch('/api/update-discord', {
            method: 'POST',
        });

        if (!backendResponse.ok) {
            const errorData = await backendResponse.json();
            throw new Error(errorData.error || "Backend failed to update Discord.");
        }
        
        toast({
            title: "Update Signal Sent!",
            description: `The request to update the Discord leaderboard has been sent.`
        });
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Discord Post Failed',
            description: error.message || 'Could not post to Discord. Check webhook URL and console.'
        });
    } finally {
        setIsPostingToDiscord(false);
    }
  };

  return (
    <main className="container mx-auto p-4 md:p-6">
      <div className="grid gap-6 max-w-4xl mx-auto">
        <Card className="bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="font-headline">Game Settings</CardTitle>
            <CardDescription>Configure integrations and scoring for the game.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <h3 className="text-lg font-medium text-primary">Community Sync</h3>
                <p className="text-sm text-muted-foreground -mt-4">
                  This app syncs player data from your external API. The community list on the main page will refresh automatically on load.
                </p>
                
                <FormField
                  control={form.control}
                  name="externalApiUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>External API URL</FormLabel>
                      <FormControl>
                        <Input placeholder="http://127.0.0.1:8090/api/get-players" {...field} />
                      </FormControl>
                      <FormDescription>
                        The endpoint that returns a JSON object with a "players" array. Each player can include a `score` for community points.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <Separator />
                 <h3 className="text-lg font-medium text-primary">Twitch Authentication</h3>
                 <FormField
                  control={form.control}
                  name="twitchClientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Twitch Application Client ID</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter your Twitch Application Client ID" {...field} />
                      </FormControl>
                      <FormDescription>
                        Required for user login.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="twitchClientSecret"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Twitch Application Client Secret</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Enter your Twitch Application Client Secret" {...field} />
                      </FormControl>
                      <FormDescription>
                        Required for the secure server-side OAuth flow.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <Separator />
                <h3 className="text-lg font-medium text-primary">Bot Integrations (Optional)</h3>

                <FormField
                  control={form.control}
                  name="discordWebhookUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Discord Webhook URL</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Enter your Discord channel webhook URL" {...field} />
                      </FormControl>
                      <FormDescription>
                        Used by the backend to post and update a live leaderboard message in a Discord channel.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="discordLeaderboardMessageId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Discord Leaderboard Message ID</FormLabel>
                      <FormControl>
                        <Input placeholder="This ID is managed by the backend" {...field} disabled />
                      </FormControl>
                      <FormDescription>
                        The ID of the message to be updated. This is handled automatically by the backend.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="twitchBotToken"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Twitch Bot Token</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Enter your Twitch bot's OAuth token" {...field} />
                      </FormControl>
                      <FormDescription>
                        The `oauth:` token for the Twitch account that will act as your chat bot (for announcing tags).
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <Separator />
                
                <h3 className="text-lg font-medium text-primary">Scoring</h3>
                <div className="grid md:grid-cols-2 gap-8">
                    <FormField
                    control={form.control}
                    name="tagSuccessPoints"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Tag Success Points</FormLabel>
                        <FormControl>
                            <Input type="number" placeholder="100" {...field} />
                        </FormControl>
                        <FormDescription>Points awarded for a successful tag.</FormDescription>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="tagPenaltyPoints"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Tag Penalty Points</FormLabel>
                        <FormControl>
                            <Input type="number" placeholder="50" {...field} />
                        </FormControl>
                        <FormDescription>Points deducted when tagged.</FormDescription>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="bingoSquarePoints"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Bingo Square Points</FormLabel>
                        <FormControl>
                            <Input type="number" placeholder="10" {...field} />
                        </FormControl>
                        <FormDescription>Points for claiming a single bingo square.</FormDescription>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="bingoWinPoints"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Bingo Win Bonus</FormLabel>
                        <FormControl>
                            <Input type="number" placeholder="250" {...field} />
                        </FormControl>
                        <FormDescription>Bonus points for getting a bingo.</FormDescription>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                </div>


                <Button type="submit" disabled={form.formState.isSubmitting || isLoading}>
                  {isLoading ? "Loading..." : form.formState.isSubmitting ? "Saving..." : "Save Settings"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card className="bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="font-headline">Developer Actions</CardTitle>
             <CardDescription>Tools for helping with development and testing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
               <p className="text-sm text-muted-foreground">Select a live stream to post the game link in:</p>
               <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button>
                    <Share2 className="mr-2 h-4 w-4" />
                    Share in Chat
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {activePlayers.length > 0 ? (
                    activePlayers.map((host) => (
                      <DropdownMenuItem
                        key={host.id}
                        onClick={() => handleShare(host.twitchUsername)}
                      >
                        {host.twitchUsername}'s stream
                      </DropdownMenuItem>
                    ))
                  ) : (
                    <DropdownMenuItem disabled>
                      No active streams
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-4">
               <p className="text-sm text-muted-foreground">Trigger an update of the Discord leaderboard message. Will post a new message if one doesn't exist.</p>
               <Button onClick={handlePostToDiscord} disabled={isPostingToDiscord}>
                  <MessageSquare className={`mr-2 h-4 w-4 ${isPostingToDiscord ? 'animate-spin' : ''}`} />
                  {isPostingToDiscord ? 'Updating...' : 'Update Discord'}
                </Button>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-4">
               <p className="text-sm text-muted-foreground">Verify that the app can write to your Firestore database.</p>
               <Button onClick={handleTestWrite} disabled={isTestingWrite}>
                  <AlertTriangle className={`mr-2 h-4 w-4 ${isTestingWrite ? 'animate-spin' : ''}`} />
                  {isTestingWrite ? 'Testing...' : 'Test Firestore Write'}
                </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
