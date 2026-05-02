
'use client';

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, MessageSquare, Trash2, Image, Trash, Download } from "lucide-react";
import { useSession } from "@/contexts/session-context";
import { isAdminUsername } from "@/lib/admin";
import { getAuthHeaders } from "@/lib/client-auth";

const SettingsSchema = z.object({
  discordWebhookUrl: z.string().url("Must be a valid webhook URL.").optional().or(z.literal('')),
  tagSuccessPoints: z.coerce.number().min(0),
  tagPenaltyPoints: z.coerce.number().min(0),
  bingoSquarePoints: z.coerce.number().min(0),
  bingoWinPoints: z.coerce.number().min(0),
});

type SettingsForm = z.infer<typeof SettingsSchema>;

export default function SettingsPage() {
  const { user, isUserLoading } = useSession();
  const isAdmin = isAdminUsername(user?.twitchUsername);
  const [isLoading, setIsLoading] = useState(true);
  const [isPostingToDiscord, setIsPostingToDiscord] = useState(false);
  const [isClearingAway, setIsClearingAway] = useState(false);
  const [isFixingPlayers, setIsFixingPlayers] = useState(false);
  const [fixResult, setFixResult] = useState<any>(null);
  const [isPruning, setIsPruning] = useState(false);
  const [pruneResult, setPruneResult] = useState<any>(null);
  const [supportTickets, setSupportTickets] = useState<any[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);

  const form = useForm<SettingsForm>({
    resolver: zodResolver(SettingsSchema),
    defaultValues: {
      discordWebhookUrl: "",
      tagSuccessPoints: 100,
      tagPenaltyPoints: 50,
      bingoSquarePoints: 10,
      bingoWinPoints: 250,
    },
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings', { headers: getAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          form.reset({
            discordWebhookUrl: data.discordWebhookUrl || "",
            tagSuccessPoints: data.tagSuccessPoints ?? 100,
            tagPenaltyPoints: data.tagPenaltyPoints ?? 50,
            bingoSquarePoints: data.bingoSquarePoints ?? 10,
            bingoWinPoints: data.bingoWinPoints ?? 250,
          });
        }
      } catch (e) {
        console.error('Failed to load settings:', e);
      } finally {
        setIsLoading(false);
      }
    })();
    fetchSupportTickets();
  }, [form]);

  const fetchSupportTickets = async () => {
    try {
      const response = await fetch('/api/bot/state');
      const data = await response.json();
      const tickets = data.supportTickets || {};
      setSupportTickets(Object.values(tickets).filter((t: any) => !t.resolved));
    } catch (error) {
      console.error('Failed to fetch support tickets:', error);
    } finally {
      setLoadingTickets(false);
    }
  };

  const handleResolveTicket = async (messageId: string) => {
    try {
      const response = await fetch('/api/discord/resolve-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId })
      });
      if (!response.ok) throw new Error('Failed to resolve ticket');
      toast({ title: 'Ticket Resolved', description: 'Support ticket has been deleted from Discord.' });
      fetchSupportTickets();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Failed to Resolve', description: error.message });
    }
  };

  const onSubmit = async (data: SettingsForm) => {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast({ title: "Settings saved!", description: "Your settings have been updated." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save Failed", description: error.message });
    }
  };

  const handlePostToDiscord = async () => {
    setIsPostingToDiscord(true);
    try {
      const res = await fetch('/api/update-discord', { method: 'POST', headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Backend failed to update Discord.');
      toast({ title: "Update Signal Sent!", description: "The request to update the Discord leaderboard has been sent." });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Discord Post Failed', description: error.message });
    } finally {
      setIsPostingToDiscord(false);
    }
  };

  const handleClearAllAway = async () => {
    setIsClearingAway(true);
    try {
      const res = await fetch('/api/tag', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'clear-all-away' })
      });
      if (!res.ok) throw new Error('Failed to clear away status');
      toast({ title: "Away Status Cleared!", description: "All players' immunity has been cleared." });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Clear Away Failed', description: error.message });
    } finally {
      setIsClearingAway(false);
    }
  };

  if (isUserLoading) {
    return (
      <main className="container mx-auto p-4 md:p-6">
        <div className="max-w-4xl mx-auto text-sm text-muted-foreground">Loading settings...</div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="container mx-auto p-4 md:p-6">
        <Card className="max-w-2xl mx-auto bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="font-headline">Admin Access Required</CardTitle>
            <CardDescription>
              This page is reserved for approved app admins.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="container mx-auto p-4 md:p-6">
      <div className="grid gap-6 max-w-4xl mx-auto">
        <Card className="bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="font-headline">Game Settings</CardTitle>
            <CardDescription>Configure scoring and integrations.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <h3 className="text-lg font-medium text-primary">Bot Integrations</h3>
                <FormField control={form.control} name="discordWebhookUrl" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Discord Webhook URL</FormLabel>
                    <FormControl><Input type="password" placeholder="Enter your Discord channel webhook URL" {...field} /></FormControl>
                    <FormDescription>Used to post and update a live leaderboard message in Discord.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />

                <Separator />
                <h3 className="text-lg font-medium text-primary">Scoring</h3>
                <div className="grid md:grid-cols-2 gap-8">
                  <FormField control={form.control} name="tagSuccessPoints" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tag Success Points</FormLabel>
                      <FormControl><Input type="number" placeholder="100" {...field} /></FormControl>
                      <FormDescription>Points awarded for a successful tag.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="tagPenaltyPoints" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tag Penalty Points</FormLabel>
                      <FormControl><Input type="number" placeholder="50" {...field} /></FormControl>
                      <FormDescription>Points deducted when tagged.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="bingoSquarePoints" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bingo Square Points</FormLabel>
                      <FormControl><Input type="number" placeholder="10" {...field} /></FormControl>
                      <FormDescription>Points for claiming a single bingo square.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="bingoWinPoints" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bingo Win Bonus</FormLabel>
                      <FormControl><Input type="number" placeholder="250" {...field} /></FormControl>
                      <FormDescription>Bonus points for getting a bingo.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
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
            <CardTitle className="font-headline">Admin Actions</CardTitle>
            <CardDescription>Tools for managing the game.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">Trigger an update of the Discord leaderboard message.</p>
              <Button onClick={handlePostToDiscord} disabled={isPostingToDiscord}>
                <MessageSquare className={`mr-2 h-4 w-4 ${isPostingToDiscord ? 'animate-spin' : ''}`} />
                {isPostingToDiscord ? 'Updating...' : 'Update Discord'}
              </Button>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">Clear all players' away/immunity status.</p>
              <Button onClick={handleClearAllAway} disabled={isClearingAway} variant="destructive">
                <AlertTriangle className={`mr-2 h-4 w-4 ${isClearingAway ? 'animate-spin' : ''}`} />
                {isClearingAway ? 'Clearing...' : 'Clear All Away'}
              </Button>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Fix missing avatars, merge duplicate players, sync bot channels.</p>
                {fixResult && (
                  <p className="text-xs text-green-500 mt-1">
                    ✅ Avatars: {fixResult.avatarsFetched} fixed | Dupes: {fixResult.mergedDupes} merged | Channels: {fixResult.channelsAdded} added
                  </p>
                )}
              </div>
              <Button onClick={async () => {
                setIsFixingPlayers(true);
                setFixResult(null);
                try {
                  const res = await fetch('/api/admin/fix-players', { method: 'POST', headers: getAuthHeaders() });
                  if (!res.ok) throw new Error('Failed');
                  const data = await res.json();
                  setFixResult(data);
                  toast({ title: 'Players Fixed!', description: `Avatars: ${data.avatarsFetched}, Dupes merged: ${data.mergedDupes}` });
                } catch (e: any) {
                  toast({ variant: 'destructive', title: 'Fix Failed', description: e.message });
                } finally {
                  setIsFixingPlayers(false);
                }
              }} disabled={isFixingPlayers}>
                <Image className={`mr-2 h-4 w-4 ${isFixingPlayers ? 'animate-spin' : ''}`} />
                {isFixingPlayers ? 'Fixing...' : 'Fix Players & Avatars'}
              </Button>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Remove orphaned bot channels that have no matching player.</p>
                {pruneResult && (
                  <p className="text-xs text-green-500 mt-1">
                    ✅ Pruned {pruneResult.pruned} orphans ({pruneResult.before} → {pruneResult.after} channels, {pruneResult.players} players)
                  </p>
                )}
              </div>
              <Button onClick={async () => {
                setIsPruning(true);
                setPruneResult(null);
                try {
                  const res = await fetch('/api/admin/prune-channels', { method: 'POST', headers: getAuthHeaders() });
                  if (!res.ok) throw new Error('Failed');
                  const data = await res.json();
                  setPruneResult(data);
                  toast({ title: 'Channels Pruned!', description: `Removed ${data.pruned} orphaned channels` });
                } catch (e: any) {
                  toast({ variant: 'destructive', title: 'Prune Failed', description: e.message });
                } finally {
                  setIsPruning(false);
                }
              }} disabled={isPruning} variant="outline">
                <Trash className={`mr-2 h-4 w-4 ${isPruning ? 'animate-spin' : ''}`} />
                {isPruning ? 'Pruning...' : 'Prune Orphaned Channels'}
              </Button>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">Download admin history and mod activity logs.</p>
              <Button onClick={async () => {
                const res = await fetch('/api/logs', { headers: getAuthHeaders() });
                if (!res.ok) {
                  toast({ variant: 'destructive', title: 'Download Failed', description: 'Could not fetch logs.' });
                  return;
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
                setTimeout(() => URL.revokeObjectURL(url), 60000);
              }} variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Download Logs
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="font-headline">Support Tickets</CardTitle>
            <CardDescription>Manage support requests from players</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingTickets ? (
              <p className="text-sm text-muted-foreground">Loading tickets...</p>
            ) : supportTickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open support tickets</p>
            ) : (
              <div className="space-y-3">
                {supportTickets.map((ticket: any) => (
                  <div key={ticket.messageId} className="flex items-start justify-between gap-4 p-3 border rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{ticket.requester}</p>
                      <p className="text-sm text-muted-foreground">Channel: {ticket.channel}</p>
                      {ticket.note && <p className="text-sm mt-1">{ticket.note}</p>}
                      <p className="text-xs text-muted-foreground mt-1">{new Date(ticket.createdAt).toLocaleString()}</p>
                    </div>
                    <Button size="sm" variant="destructive" onClick={() => handleResolveTicket(ticket.messageId)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
