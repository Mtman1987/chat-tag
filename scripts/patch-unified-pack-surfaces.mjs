import fs from 'node:fs';

function patchFile(path, patches) {
  let source = fs.readFileSync(path, 'utf8');
  for (const { before, after, already } of patches) {
    if (already && source.includes(already)) continue;
    if (!source.includes(before)) throw new Error(`Unified pack patch target missing in ${path}: ${before.slice(0, 90)}`);
    source = source.replace(before, after);
  }
  fs.writeFileSync(path, source);
}

patchFile('src/app/api/discord/chat/route.ts', [
  {
    before: "import { sendDiscordMessage } from '@/lib/discord-webhooks';",
    after: "import { scheduleDiscordMessageCleanup, sendDiscordMessage } from '@/lib/discord-webhooks';\nimport { editDiscordSentMessage } from '@/lib/discord-message-edit';\nimport { createQuackversePackMediaEvent, queueQuackversePackGif, waitForQuackversePackGif } from '@/lib/quackverse-pack-media';",
    already: "scheduleDiscordMessageCleanup, sendDiscordMessage",
  },
  {
    before: `  const cardEmbeds = packCards.slice(0, 5).map((card: any) => {\n    const cardImageUrl = absolutePublicUrl(\n      req,\n      card?.cardImageUrl || \`/api/quackverse/pack-preview?ids=\${encodeURIComponent(String(card?.id || ''))}&mode=card\`,\n    );\n    return {\n      title: \`#\${card?.id || '?'} \${card?.name || 'Unknown Card'}\`,\n      description: \`\${card?.rarity || 'Unknown'} · \${card?.type || 'Quackverse'}\`,\n      color: 0x00d9ff,\n      ...(cardImageUrl ? { image: { url: cardImageUrl } } : {}),\n    };\n  });\n\n  const result = await sendDiscordMessage({`,
    after: `  // Keep the initial Discord response compact. The five cards remain in the\n  // text fields while DSH records the real pack-opening animation in the\n  // background. When that GIF is ready we edit this same Discord message.\n  const result = await sendDiscordMessage({`,
    already: 'Keep the initial Discord response compact.',
  },
  {
    before: `    embeds: [embed, ...cardEmbeds],\n    allowedMentions: { parse: [] },\n    botToken: DISCORD_BOT_TOKEN,\n    recordHistorySource: 'discord/chat-pack',\n    cleanupAfterMs: CLEANUP_DELAY_MS,\n  });\n  if (!result.ok) {\n    throw new Error(result.error);\n  }\n  if (context.isPrivate && result.messageId) {`,
    after: `    embeds: [embed],\n    allowedMentions: { parse: [] },\n    botToken: DISCORD_BOT_TOKEN,\n    recordHistorySource: 'discord/chat-pack',\n  });\n  if (!result.ok) {\n    throw new Error(result.error);\n  }\n  const sentResult = result;\n  if (packData.packId && sentResult.messageId) {\n    void (async () => {\n      try {\n        const event = createQuackversePackMediaEvent({\n          eventId: String(packData.packId),\n          username: userName,\n          cards: packCards.map((card: any) => ({\n            ...card,\n            cardImageUrl: absolutePublicUrl(\n              req,\n              card?.cardImageUrl || ('/api/quackverse/pack-preview?ids=' + encodeURIComponent(String(card?.id || '')) + '&mode=card'),\n            ),\n          })),\n        });\n        await queueQuackversePackGif(event);\n        const gifUrl = await waitForQuackversePackGif(event.eventId);\n        if (!gifUrl) return;\n        const edited = await editDiscordSentMessage({\n          channelId,\n          result: sentResult,\n          botToken: DISCORD_BOT_TOKEN,\n          embeds: [{ ...embed, image: { url: gifUrl } }],\n        });\n        if (edited) {\n          // The ten-minute lifespan begins when viewers can actually see the\n          // finished looping pack animation, not while it is still rendering.\n          scheduleDiscordMessageCleanup(channelId, sentResult, DISCORD_BOT_TOKEN, CLEANUP_DELAY_MS);\n        }\n      } catch (error) {\n        console.warn('[Discord Chat] Quackverse pack GIF render failed:', error instanceof Error ? error.message : error);\n      }\n    })();\n  }\n  if (context.isPrivate && result.messageId) {`,
    already: 'The ten-minute lifespan begins when viewers can actually see the',
  },
]);

// Twitch-originated pack opens also feed the shared Discord announcement state.
// Keep that payload informational only; never attach five giant card embeds.
patchFile('bot.js', [
  {
    before: `      if (packCards.length > 0) {\n        const cardEmbeds = packCards.slice(0, 5).map((card) => ({\n          title: \`#\${card?.id || '?'} \${card?.name || 'Unknown Card'}\`,\n          description: \`\${card?.rarity || 'Unknown'} · \${card?.type || 'Quackverse'}\`,\n          color: 0x00d9ff,\n          image: { url: card?.cardImageUrl },\n        })).filter((embed) => embed.image.url);\n        const announceRes = await apiCall('/api/discord/announce', {`,
    after: `      if (packCards.length > 0) {\n        // Discord gets one compact pack summary. Card art is reserved for the\n        // single recorded pack-opening GIF instead of five separate embeds.\n        const announceRes = await apiCall('/api/discord/announce', {`,
    already: 'Card art is reserved for the',
  },
  {
    before: `              },\n              ...cardEmbeds,\n            ],`,
    after: `              },\n            ],`,
    already: '              },\n            ],\n          }),',
  },
]);

patchFile('src/app/api/quackverse/pack/route.ts', [
  {
    before: `    body: JSON.stringify({\n      username: input.username,\n      setName: 'Quackverse',`,
    after: `    body: JSON.stringify({\n      eventId: input.packId,\n      packId: input.packId,\n      username: input.username,\n      setName: 'Quackverse',`,
    already: 'eventId: input.packId',
  },
]);
