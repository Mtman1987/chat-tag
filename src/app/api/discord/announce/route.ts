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
      // If payload contains an image URL, fetch it and upload as an attachment so
      // Discord will reliably render the image inside the embed (use attachment:// filename).
      let response: Response;
      const embedImageUrl = (webhookPayload.embeds && Array.isArray(webhookPayload.embeds) && webhookPayload.embeds[0]?.image?.url) || (webhookPayload.imageUrl as string) || (webhookPayload.thumbnailUrl as string);
      if (embedImageUrl) {
        try {
          const imgRes = await fetch(String(embedImageUrl));
          if (imgRes.ok) {
            const contentType = imgRes.headers.get("content-type") || "application/octet-stream";
            const arrayBuffer = await imgRes.arrayBuffer();
            const filename = `attachment-${Date.now()}${contentType.includes("png") ? ".png" : contentType.includes("gif") ? ".gif" : contentType.includes("jpeg") || contentType.includes("jpg") ? ".jpg" : ".bin"}`;

            // Update embed to reference attachment
            if (webhookPayload.embeds && Array.isArray(webhookPayload.embeds) && webhookPayload.embeds[0]) {
              if (webhookPayload.embeds[0].image && webhookPayload.embeds[0].image.url) {
                webhookPayload.embeds[0].image.url = `attachment://${filename}`;
              }
              if (webhookPayload.embeds[0].thumbnail && webhookPayload.embeds[0].thumbnail.url) {
                webhookPayload.embeds[0].thumbnail.url = `attachment://${filename}`;
              }
            } else {
              if (webhookPayload.imageUrl) webhookPayload.imageUrl = `attachment://${filename}`;
              if (webhookPayload.thumbnailUrl) webhookPayload.thumbnailUrl = `attachment://${filename}`;
            }

            const form = new FormData();
            const blob = new Blob([arrayBuffer], { type: contentType });
            form.append("file", blob as any, filename);
            form.append("payload_json", JSON.stringify(webhookPayload));

            response = await fetch(webhookUrl.toString(), {
              method: "POST",
              body: form as any,
            });
          } else {
            // fallback to JSON if image fetch failed
            response = await fetch(webhookUrl.toString(), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(webhookPayload),
            });
          }
        } catch (err) {
          console.error("[Announce] failed to fetch/embed image, sending JSON fallback:", err);
          response = await fetch(webhookUrl.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(webhookPayload),
          });
        }
      } else {
        response = await fetch(webhookUrl.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(webhookPayload),
        });
      }

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
        return {
          ok: true,
          configured: true,
          status: response.status,
          messageId: sentMessage?.id,
        };
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

function buildCustomEmbed(body: Record<string, any>) {
  const hasCustomEmbed =
    Array.isArray(body.embeds) ||
    typeof body.title === "string" ||
    typeof body.description === "string" ||
    typeof body.imageUrl === "string" ||
    typeof body.thumbnailUrl === "string" ||
    Array.isArray(body.fields);

  if (!hasCustomEmbed) return null;

  if (Array.isArray(body.embeds)) {
    return { embeds: body.embeds };
  }

  const embed: Record<string, any> = {
    title: body.title || undefined,
    description: body.description || undefined,
    color: Number.isFinite(body.color) ? body.color : 0x00d9ff,
    timestamp: body.timestamp || new Date().toISOString(),
    footer: body.footerText ? { text: body.footerText } : { text: "SPMT Chat Tag" },
  };

  if (Array.isArray(body.fields) && body.fields.length > 0) {
    embed.fields = body.fields
      .map((field: any) => ({
        name: String(field?.name || "").slice(0, 256),
        value: String(field?.value || "").slice(0, 1024),
        inline: Boolean(field?.inline),
      }))
      .filter((field: any) => field.name && field.value);
  }

  if (body.imageUrl) embed.image = { url: body.imageUrl };
  if (body.thumbnailUrl) embed.thumbnail = { url: body.thumbnailUrl };
  if (body.authorName || body.authorUrl || body.authorIconUrl) {
    embed.author = {
      name: body.authorName || undefined,
      url: body.authorUrl || undefined,
      icon_url: body.authorIconUrl || undefined,
    };
  }

  return { embeds: [embed] };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tagger, tagged, doublePoints, message, refreshOnly } = body;

    const state = await readAppState();
    const gameState = buildGameStatePayload(state);
    const customPayload = buildCustomEmbed(body);

    let discordResult: DiscordWebhookResult & { skipped?: boolean } = {
      ok: Boolean(refreshOnly),
      configured: Boolean(DISCORD_WEBHOOK_URL),
      status: 0,
      skipped: Boolean(refreshOnly),
      error: refreshOnly
        ? undefined
        : customPayload
          ? "Discord webhook was not attempted"
          : tagger && tagged
            ? "Discord webhook was not attempted"
            : "Tagger and tagged are required for Discord announcements",
    };

    // Post the Discord message first so a DSH outage/503 cannot block announcements.
    if (!refreshOnly && customPayload) {
      discordResult = await postDiscordWebhook(customPayload);
    } else if (!refreshOnly && tagger && tagged) {
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

    const shouldEnforceDiscordResult = Boolean(customPayload) || (tagger && tagged && !refreshOnly);
    if (shouldEnforceDiscordResult && (!discordResult.configured || !discordResult.ok)) {
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
