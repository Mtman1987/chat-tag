
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
import { AlertTriangle, Trash2, Image as ImageIcon, Trash, Download } from "lucide-react";
import { useSession } from "@/contexts/session-context";
import { isClientAdminUsername } from "@/lib/client-admin";
import { getAuthHeaders } from "@/lib/client-auth";

const SettingsSchema = z.object({
  tagSuccessPoints: z.coerce.number().min(0),
  tagPenaltyPoints: z.coerce.number().min(0),
  bingoSquarePoints: z.coerce.number().min(0),
  bingoWinPoints: z.coerce.number().min(0),
  uiThemePreset: z.enum(['cosmic', 'aurora', 'ember']),
});

type SettingsForm = z.infer<typeof SettingsSchema>;

export default function SettingsPage() {
  const { user, isUserLoading } = useSession();
  const isAdmin = isClientAdminUsername(user?.twitchUsername);
  const [isLoading, setIsLoading] = useState(true);
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
      tagSuccessPoints: 100,
      tagPenaltyPoints: 50,
      bingoSquarePoints: 10,
      bingoWinPoints: 250,
      uiThemePreset: 'cosmic',
    },
  });

  const applyThemePreview = (preset: SettingsForm['uiThemePreset']) => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.appTheme = preset;
  };

  useEffect(() => {
    if (isUserLoading) return;

    if (!isAdmin) {
      setIsLoading(false);
      setLoadingTickets(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch('/api/settings', { headers: getAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          form.reset({
            tagSuccessPoints: data.tagSuccessPoints ?? 100,
            tagPenaltyPoints: data.tagPenaltyPoints ?? 50,
            bingoSquarePoints: data.bingoSquarePoints ?? 10,
            bingoWinPoints: data.bingoWinPoints ?? 250,
            uiThemePreset: data.uiThemePreset ?? 'cosmic',
          });
          applyThemePreview(data.uiThemePreset ?? 'cosmic');
        }
      } catch (e) {
        console.error('Failed to load settings:', e);
      } finally {
        setIsLoading(false);
      }
    })();
    fetchSupportTickets();
  }, [form, isAdmin, isUserLoading]);

  const fetchSupportTickets = async () => {
    try {
      const response = await fetch('/api/bot/state', { headers: getAuthHeaders() });
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
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
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
      applyThemePreview(data.uiThemePreset);
      toast({ title: "Settings saved!", description: "Your settings have been updated." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save Failed", description: error.message });
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
      <main className="cosmic-page">
        <div className="max-w-4xl mx-auto text-sm text-muted-foreground">Loading settings...</div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="cosmic-page">
        <Card className="max-w-2xl mx-auto rounded-[1.5rem] border-white/10 bg-white/[0.05] backdrop-blur-xl">
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
    <main className="cosmic-page">
      <section className="cosmic-hero max-w-6xl mx-auto">
        <div className="cosmic-card space-y-4">
          <div className="cosmic-status">Production Layout</div>
          <h1 className="cosmic-title">Settings</h1>
          <p className="cosmic-subtitle">
            Scoring, repair tasks, bot cleanup, support queue, and theme editing stay wired to the current admin routes. This page now matches the suite shell instead of the old standalone admin card layout.
          </p>
          <div className="cosmic-note">
            Theme preset saves into app settings and is applied through the root shell, so the suite look can be changed without editing CSS per deploy.
          </div>
        </div>
        <div className="cosmic-panel">
          <h2 className="mb-4 font-headline text-2xl text-white">Live Preview</h2>
          <div className="mock-window">
            <div className="mock-head">
              <span className="mock-dot mock-dot-red" />
              <span className="mock-dot mock-dot-amber" />
              <span className="mock-dot mock-dot-green" />
            </div>
            <div className="mock-body">
              <div className="mock-row"><span>App</span><span>Chat-Tag</span></div>
              <div className="mock-row"><span>Page</span><span>settings</span></div>
              <div className="mock-row"><span>Mode</span><span>Admin tools</span></div>
              <div className="mock-row"><span>Theme</span><span>{form.watch('uiThemePreset')}</span></div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 max-w-5xl mx-auto">
        <Card className="rounded-[1.5rem] border-white/10 bg-white/[0.05] backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="font-headline">Game Settings</CardTitle>
            <CardDescription>Configure scoring and integrations.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
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
                  <FormField control={form.control} name="uiThemePreset" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Suite Theme</FormLabel>
                      <FormControl>
                        <select
                          {...field}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="cosmic">Cosmic</option>
                          <option value="aurora">Aurora</option>
                          <option value="ember">Ember</option>
                        </select>
                      </FormControl>
                      <FormDescription>Saved shell preset for the app chrome and suite accents.</FormDescription>
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

        <Card className="rounded-[1.5rem] border-white/10 bg-white/[0.05] backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="font-headline">Admin Actions</CardTitle>
            <CardDescription>Tools for managing the game.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                <ImageIcon className={`mr-2 h-4 w-4 ${isFixingPlayers ? 'animate-spin' : ''}`} />
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

        <Card className="rounded-[1.5rem] border-white/10 bg-white/[0.05] backdrop-blur-xl">
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
