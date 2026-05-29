import { NextRequest, NextResponse } from "next/server";
import { readAppState, toMillis } from "@/lib/volume-store";
import { getScoringSettings, scoreFromTagCounts } from "@/lib/scoring";
import { postOrUpdateGameEmbed } from "@/lib/discord-embed";

const DSH_URL = process.env.DSH_URL || "https://discord-stream-hub-new.fly.dev";
const DISCORD_WEBHOOK_URL =
  process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_TAG_WEBHOOK_URL || "";
const DISCORD_RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelayMs(response: Response, attempt: number) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number.parseFloat(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, 5000);
    }
  }

  return Math.min(500 * 2 ** attempt, 3000);
}

async function postDiscordWebhook(payload: Record<string, unknown>) {
  if (!DISCORD_WEBHOOK_URL) {
    console.warn(
      "[Announce] Discord webhook skipped: DISCORD_WEBHOOK_URL or DISCORD_TAG_WEBHOOK_URL is not configured",
    );
    return {
      ok: false,
      configured: false,
      status: 0,
      error: "Discord webhook URL is not configured",
    };
  }

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        console.log(
          `[Announce] Discord webhook message sent (status ${response.status})`,
        );
        return { ok: true, configured: true, status: response.status };
      }

      const text = await response.text();
      lastError =
        text.slice(0, 300) ||
        response.statusText ||
        "Discord webhook request failed";
      console.error(
        `[Announce] Discord webhook failed (attempt ${attempt + 1}/3): ${response.status} ${lastError}`,
      );

      if (!DISCORD_RETRY_STATUSES.has(response.status) || attempt === 2) {
        return {
          ok: false,
          configured: true,
          status: response.status,
          error: lastError,
        };
      }

      await sleep(getRetryDelayMs(response, attempt));
    } catch (error: any) {
      lastError = error?.message || "Discord webhook request failed";
      console.error(
        `[Announce] Discord webhook error (attempt ${attempt + 1}/3): ${lastError}`,
      );
      if (attempt === 2) {
        return { ok: false, configured: true, status: 0, error: lastError };
      }
      await sleep(500 * 2 ** attempt);
    }
  }

  return {
    ok: false,
    configured: true,
    status: 0,
    error: lastError || "Discord webhook request failed",
  };
}

async function refreshDshEmbed(gameState: Record<string, unknown>) {
  if (!DSH_URL) {
    console.log("[Announce] DSH refresh skipped: DSH_URL is not configured");
    return { ok: true, skipped: true, status: 0 };
  }

  try {
    const dshRes = await fetch(`${DSH_URL}/api/chat-tag/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameState }),
    });
    if (dshRes.ok) {
      console.log("[Announce] DSH embed updated");
      return { ok: true, status: dshRes.status };
    }

    const text = await dshRes.text();
    console.error(
      `[Announce] DSH refresh failed: ${dshRes.status} ${text.slice(0, 200)}`,
    );
    return {
      ok: false,
      status: dshRes.status,
      error: text.slice(0, 300) || dshRes.statusText,
    };
  } catch (e: any) {
    console.error("[Announce] DSH refresh error:", e.message);
    return { ok: false, status: 0, error: e.message };
  }
}

async function refreshSelfEmbed() {
  try {
    const result = await postOrUpdateGameEmbed();
    console.log(`[Announce] Self-embed ${result.action}: ${result.messageId || 'none'}`);
    return { ok: result.action !== 'skipped', ...result };
  } catch (e: any) {
    console.error('[Announce] Self-embed error:', e.message);
    return { ok: false, action: 'skipped' as const, messageId: null, error: e.message };
  }
}

function buildGameStatePayload(state: any) {
  const scoring = getScoringSettings(state);
  const tagCounts: Record<string, { tags: number; tagged: number }> = {};
  for (const entry of state.tagHistory) {
    if (entry.blocked) continue;
    const from = entry.taggerId || entry.from;
    const to = entry.taggedId || entry.to;
    if (from && from !== "system") {
      if (!tagCounts[from]) tagCounts[from] = { tags: 0, tagged: 0 };
      tagCounts[from].tags += 1;
    }
    if (to && to !== "system" && to !== "free-for-all") {
      if (!tagCounts[to]) tagCounts[to] = { tags: 0, tagged: 0 };
      tagCounts[to].tagged += 1;
    }
  }

  const players = Object.values(state.tagPlayers).map((p: any) => {
    const counts = tagCounts[p.id] || { tags: 0, tagged: 0 };
    const score = scoreFromTagCounts(counts, scoring) + (p.bingoPoints || 0);
    return {
      id: p.id,
      twitchUsername: p.twitchUsername || p.username,
      score,
      tags: counts.tags,
      tagged: counts.tagged,
      isIt: Boolean(p.isIt),
      sleepingImmunity: Boolean(p.sleepingImmunity),
      offlineImmunity: Boolean(p.offlineImmunity),
      hasPass: Boolean(p.hasPass),
    };
  });

  const leaderboard = [...players]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ rank: i + 1, ...p }));

  const currentIt = players.find((p) => p.isIt);

  const recentHistory = [...state.tagHistory]
    .sort(
      (a: any, b: any) =>
        (toMillis(b.timestamp) || 0) - (toMillis(a.timestamp) || 0),
    )
    .slice(0, 25)
    .map((entry: any) => {
      const taggerId = entry.taggerId || entry.from;
      const taggedId = entry.taggedId || entry.to;
      const tagger = state.tagPlayers[taggerId];
      const tagged = state.tagPlayers[taggedId];
      return {
        taggerUsername: tagger?.twitchUsername || taggerId,
        taggedUsername: tagged?.twitchUsername || taggedId,
        timestamp: toMillis(entry.timestamp),
        doublePoints: Boolean(entry.doublePoints),
        blocked: entry.blocked || null,
      };
    });

  const bingoCard = state.bingoCards.current_user || {
    phrases: [],
    covered: {},
  };
  const bingo = {
    phrases: bingoCard.phrases || [],
    covered: bingoCard.covered || {},
    claimedCount: Object.keys(bingoCard.covered || {}).length,
    totalSquares: (bingoCard.phrases || []).length,
  };

  return {
    tag: {
      currentIt: currentIt
        ? { id: currentIt.id, twitchUsername: currentIt.twitchUsername }
        : null,
      isFreeForAll: !currentIt,
      lastTagTime: toMillis(state.tagGame.state.lastTagTime),
      playerCount: players.length,
    },
    players,
    leaderboard,
    recentHistory,
    bingo,
    timestamp: Date.now(),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tagger, tagged, doublePoints, message, refreshOnly } = body;

    const state = await readAppState();
    const gameState = buildGameStatePayload(state);

    let discordResult: Awaited<ReturnType<typeof postDiscordWebhook>> & {
      skipped?: boolean;
    } = {
      ok: Boolean(refreshOnly),
      configured: Boolean(DISCORD_WEBHOOK_URL),
      status: 0,
      skipped: Boolean(refreshOnly),
      error: refreshOnly
        ? undefined
        : tagger && tagged
          ? "Discord webhook was not attempted"
          : "Tagger and tagged are required for Discord announcements",
    };

    // Post the Discord message first so a DSH outage/503 cannot block tag announcements.
    if (!refreshOnly && tagger && tagged) {
      const icon = doublePoints ? "🔥" : "🎯";
      const pointsNote = doublePoints ? " for **DOUBLE POINTS**" : "";
      const extraNote = message ? ` (${message})` : "";
      const newIt = gameState.tag.currentIt?.twitchUsername || "Free for all";

      discordResult = await postDiscordWebhook({
        embeds: [
          {
            title: `${icon} Tag Event!`,
            description: `**${tagger}** tagged **${tagged}**${pointsNote}!${extraNote}`,
            color: doublePoints ? 0xff4500 : 0x00d9ff,
            fields: [
              { name: "Now IT", value: newIt, inline: true },
              {
                name: "Players",
                value: `${gameState.tag.playerCount}`,
                inline: true,
              },
            ],
            timestamp: new Date().toISOString(),
            footer: { text: "SPMT Chat Tag" },
          },
        ],
      });
    }

    // Refresh the persistent game-state embed (self-managed).
    // Also refresh DSH as a fallback if configured.
    const [selfEmbedResult, dshResult] = await Promise.all([
      refreshSelfEmbed(),
      refreshDshEmbed(gameState),
    ]);

    if (tagger && tagged && (!discordResult.configured || !discordResult.ok)) {
      return NextResponse.json(
        {
          success: false,
          error: discordResult.error || "Discord webhook failed",
          discord: discordResult,
          embed: selfEmbedResult,
          dsh: dshResult,
        },
        { status: discordResult.configured ? 502 : 500 },
      );
    }

    return NextResponse.json({
      success: true,
      discord: discordResult,
      embed: selfEmbedResult,
      dsh: dshResult,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
