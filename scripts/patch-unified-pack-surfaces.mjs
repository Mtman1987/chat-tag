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
    after: "import { sendDiscordMessage } from '@/lib/discord-webhooks';\nimport { editDiscordSentMessage } from '@/lib/discord-message-edit';\nimport { createQuackversePackMediaEvent, queueQuackversePackGif, waitForQuackversePackGif } from '@/lib/quackverse-pack-media';",
    already: "from '@/lib/quackverse-pack-media'",
  },
  {
    before: `    recordHistorySource: 'discord/chat-pack',\n    cleanupAfterMs: CLEANUP_DELAY_MS,\n  });\n  if (!result.ok) {\n    throw new Error(result.error);\n  }\n  if (context.isPrivate && result.messageId) {`,
    after: `    recordHistorySource: 'discord/chat-pack',\n    cleanupAfterMs: CLEANUP_DELAY_MS,\n  });\n  if (!result.ok) {\n    throw new Error(result.error);\n  }\n  const sentResult = result;\n  if (packData.packId && sentResult.messageId) {\n    void (async () => {\n      try {\n        const event = createQuackversePackMediaEvent({\n          eventId: String(packData.packId),\n          username: userName,\n          cards: packCards.map((card: any) => ({\n            ...card,\n            cardImageUrl: absolutePublicUrl(\n              req,\n              card?.cardImageUrl || \\`/api/quackverse/pack-preview?ids=\\${encodeURIComponent(String(card?.id || ''))}&mode=card\\`,\n            ),\n          })),\n        });\n        await queueQuackversePackGif(event);\n        const gifUrl = await waitForQuackversePackGif(event.eventId);\n        if (!gifUrl) return;\n        await editDiscordSentMessage({\n          channelId,\n          result: sentResult,\n          botToken: DISCORD_BOT_TOKEN,\n          embeds: [{ ...embed, image: { url: gifUrl } }, ...cardEmbeds],\n        });\n      } catch (error) {\n        console.warn('[Discord Chat] Quackverse pack GIF render failed:', error instanceof Error ? error.message : error);\n      }\n    })();\n  }\n  if (context.isPrivate && result.messageId) {`,
    already: "Quackverse pack GIF render failed",
  },
]);

patchFile('src/app/api/quackverse/pack/route.ts', [
  {
    before: `    body: JSON.stringify({\n      username: input.username,\n      setName: 'Quackverse',`,
    after: `    body: JSON.stringify({\n      eventId: input.packId,\n      packId: input.packId,\n      username: input.username,\n      setName: 'Quackverse',`,
    already: 'eventId: input.packId',
  },
]);
