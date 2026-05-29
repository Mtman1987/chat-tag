import { NextRequest, NextResponse } from "next/server";
import { readAppState } from "@/lib/volume-store";
import { buildGameStatePayload, postOrUpdateChatTagEmbed } from "@/lib/chat-tag-discord";

const DISCORD_WEBHOOK_URL =
  process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_TAG_WEBHOOK_URL || "";
const CHAT_TAG_WEBHOOK_NAME = process.env.CHAT_TAG_WEBHOOK_NAME || "Chat Tag";
const CHAT_TAG_AVATAR_URL =
  process.env.CHAT_TAG_AVATAR_URL ||
  process.env.DISCORD_CHAT_TAG_AVATAR_URL ||
  "";
const DISCORD_RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const TAG_EVENT_DELETE_DELAY_MS = 5 * 60 * 1000;

type DiscordWebhookResult = {
  ok: boolean;
  configured: boolean;
  status: number;
  error?: string;
  messageId?: string;
};

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

async function postDiscordWebhook(payload: Record<string, unknown>): Promise<DiscordWebhookResult> {
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
      const webhookUrl = new URL(DISCORD_WEBHOOK_URL);
      webhookUrl.searchParams.set("wait", "true");
      const webhookPayload = {
        username: CHAT_TAG_WEBHOOK_NAME,
        ...(CHAT_TAG_AVATAR_URL ? { avatar_url: CHAT_TAG_AVATAR_URL } : {}),
        ...payload,
      };
      const response = await fetch(webhookUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(webhookPayload),
      });

      if (response.ok) {
        const sentMessage = await response.json().catch(() => null);
        if (sentMessage?.id) {
          setTimeout(() => {
            fetch(`${DISCORD_WEBHOOK_URL}/messages/${sentMessage.id}`, {
              method: "DELETE",
            }).catch((error) => {
              console.error("[Announce] Discord webhook cleanup failed:", error);
            });
          }, TAG_EVENT_DELETE_DELAY_MS);
        }
        console.log(
          `[Announce] Discord webhook message sent (status ${response.status})`,
        );
        return { ok: true, configured: true, status: response.status, messageId: sentMessage?.id };
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tagger, tagged, doublePoints, message, refreshOnly } = body;

    const state = await readAppState();
    const gameState = buildGameStatePayload(state);

    let discordResult: DiscordWebhookResult & { skipped?: boolean } = {
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
      const newIt = gameState.tag.currentIt?.twitchUsername || "Free for all";
      const passUsed = typeof message === "string" && /pass/i.test(message);
      const description = passUsed
        ? `🎟️ **${tagger}** used their **PASS** to tag **${tagged}** for **DOUBLE POINTS**!\n\n**${tagged}** is now it! Raid, follow, cheer, or sub to earn yours!`
        : `**${tagger}** tagged **${tagged}**${pointsNote}!${message ? ` (${message})` : ""}`;

      discordResult = await postDiscordWebhook({
        embeds: [
          {
            title: `${icon} Tag Event!`,
            description,
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

    let embedResult;
    try {
      embedResult = await postOrUpdateChatTagEmbed();
    } catch (error: any) {
      console.error("[Announce] Chat Tag persistent embed refresh failed:", error.message);
      embedResult = { ok: false, error: error.message };
    }

    if (tagger && tagged && (!discordResult.configured || !discordResult.ok)) {
      return NextResponse.json(
        {
          success: false,
          error: discordResult.error || "Discord webhook failed",
          discord: discordResult,
          embed: embedResult,
        },
        { status: discordResult.configured ? 502 : 500 },
      );
    }

    return NextResponse.json({
      success: true,
      discord: discordResult,
      embed: embedResult,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
