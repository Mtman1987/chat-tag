from pathlib import Path


def replace(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Expected block not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# Persistent Chat Tag embed: crowns and live Discord relative time.
replace(
    'src/lib/chat-tag-discord.ts',
    "import { getScoringSettings, scoreFromTagCounts } from '@/lib/scoring';\n",
    "import { getScoringSettings, scoreFromTagCounts } from '@/lib/scoring';\nimport { decorateCrownsDeep, getWinners } from '@/lib/chat-tag-crowns';\n",
)
replace(
    'src/lib/chat-tag-discord.ts',
    "  const elapsed = tag.lastTagTime ? Math.floor((Date.now() - tag.lastTagTime) / 60000) : 0;\n  const timeLine = tag.lastTagTime ? `⏱️ Last tag ${elapsed} min ago` : '⏱️ No tags yet';",
    "  const lastTagUnix = tag.lastTagTime ? Math.floor(tag.lastTagTime / 1000) : 0;\n  const timeLine = lastTagUnix\n    ? tag.currentIt\n      ? `⏱️ **${tag.currentIt.twitchUsername}** has been IT <t:${lastTagUnix}:R>`\n      : `⏱️ Free for all since <t:${lastTagUnix}:R>`\n    : '⏱️ No tags yet';",
)
replace(
    'src/lib/chat-tag-discord.ts',
    "  const payload = buildChatTagEmbed(gameState);",
    "  const winners = getWinners(state);\n  const payload = decorateCrownsDeep(buildChatTagEmbed(gameState), winners) as Record<string, unknown>;",
)

# Announcement webhook keeps its separate transport but gains crowns.
replace(
    'src/app/api/discord/announce/route.ts',
    'import { getRuntimePublicUrl } from "@/lib/runtime-config.server";\n',
    'import { getRuntimePublicUrl } from "@/lib/runtime-config.server";\nimport { decorateCrownsDeep, getWinners } from "@/lib/chat-tag-crowns";\n',
)
replace(
    'src/app/api/discord/announce/route.ts',
    "    const gameState = buildGameStatePayload(state);\n    const customPayload = buildCustomEmbed(body);",
    "    const gameState = buildGameStatePayload(state);\n    const winners = getWinners(state);\n    const customPayload = buildCustomEmbed(body);",
)
replace(
    'src/app/api/discord/announce/route.ts',
    "      discordResult = await postDiscordWebhook(customPayload);",
    "      discordResult = await postDiscordWebhook(decorateCrownsDeep(customPayload, winners));",
)
replace(
    'src/app/api/discord/announce/route.ts',
    "      discordResult = await postDiscordWebhook({\n        embeds: [",
    "      discordResult = await postDiscordWebhook(decorateCrownsDeep({\n        embeds: [",
)
replace(
    'src/app/api/discord/announce/route.ts',
    "        ],\n      });\n    }\n\n    let embedResult;",
    "        ],\n      }, winners));\n    }\n\n    let embedResult;",
)

# Use one exact tag timestamp for history and game state.
replace(
    'src/app/api/tag/route.ts',
    '          state.tagGame.state.lastTagTime = Date.now();\n',
    '          state.tagGame.state.lastTagTime = timestamp;\n',
)

# Discord command reply embeds: logo, requester footer/avatar, command, status duration, and local tag confirmation.
replace(
    'src/app/api/discord/chat/route.ts',
    "const CHAT_TAG_WEBHOOK_NAME = process.env.CHAT_TAG_WEBHOOK_NAME || 'Chat Tag';\n",
    "const CHAT_TAG_WEBHOOK_NAME = process.env.CHAT_TAG_WEBHOOK_NAME || 'Chat Tag';\nconst CHAT_TAG_AVATAR_URL = process.env.CHAT_TAG_AVATAR_URL || process.env.DISCORD_CHAT_TAG_AVATAR_URL || '';\n",
)
replace(
    'src/app/api/discord/chat/route.ts',
    "async function sendDiscordReply(channelId: string, content: string) {",
    "async function sendDiscordReply(channelId: string, content: string, context?: { requesterName?: string; requesterAvatarUrl?: string; command?: string }) {",
)
replace(
    'src/app/api/discord/chat/route.ts',
    "        title: 'Chat Tag',\n        description: content,",
    "        ...(CHAT_TAG_AVATAR_URL ? { author: { name: 'Chat Tag', icon_url: CHAT_TAG_AVATAR_URL } } : {}),\n        title: 'Chat Tag',\n        description: content,",
)
replace(
    'src/app/api/discord/chat/route.ts',
    "        footer: { text: 'SPMT Chat Tag' },",
    "        footer: {\n          text: context?.requesterName\n            ? `Requested by ${context.requesterName}${context.command ? ` • ${context.command}` : ''}`\n            : 'SPMT Chat Tag',\n          ...(context?.requesterAvatarUrl ? { icon_url: context.requesterAvatarUrl } : {}),\n        },",
)
replace(
    'src/app/api/discord/chat/route.ts',
    "    const userName = rawUserName || 'Unknown';\n",
    "    const userName = rawUserName || 'Unknown';\n    const requesterAvatarUrl = data.avatarUrl || data.avatarURL || data.userAvatarUrl || data.userAvatar || '';\n",
)
replace(
    'src/app/api/discord/chat/route.ts',
    "      const result = await sendDiscordReply(channelId, text);",
    "      const result = await sendDiscordReply(channelId, text, { requesterName: userName, requesterAvatarUrl, command: commandMessage });",
)
replace(
    'src/app/api/discord/chat/route.ts',
    "      } else {\n        await announceTagEvent(req, { tagger: displayName, tagged: targetPlayer.twitchUsername || target, doublePoints: tagData.doublePoints });\n      }",
    "      } else {\n        const taggedName = targetPlayer.twitchUsername || target;\n        await reply(`🎯 ${displayName} tagged ${taggedName}. ${taggedName} is now IT!`);\n        await announceTagEvent(req, { tagger: displayName, tagged: taggedName, doublePoints: tagData.doublePoints });\n      }",
)
replace(
    'src/app/api/discord/chat/route.ts',
    "      } else {\n        await announceTagEvent(req, { tagger: displayName, tagged: targetPlayer.twitchUsername || target, doublePoints: true, message: 'Used a Pass' });\n      }",
    "      } else {\n        const taggedName = targetPlayer.twitchUsername || target;\n        await reply(`🎟️ ${displayName} used a PASS to tag ${taggedName} for DOUBLE POINTS. ${taggedName} is now IT!`);\n        await announceTagEvent(req, { tagger: displayName, tagged: taggedName, doublePoints: true, message: 'Used a Pass' });\n      }",
)
replace(
    'src/app/api/discord/chat/route.ts',
    "        await reply(`🏷️ Current IT: ${itName}. ${itName} must tag someone next; everyone else, stay alive.`);",
    "        const lastTagTime = Number(state.tagGame?.state?.lastTagTime || 0);\n        const relative = lastTagTime ? `<t:${Math.floor(lastTagTime / 1000)}:R>` : 'for an unknown amount of time';\n        await reply(`🏷️ Current IT: ${itName}. ${itName} has been IT ${relative} and must tag someone next; everyone else, stay alive.`);",
)

# Twitch status includes duration; outgoing crown wrapper already handles winner names.
replace(
    'bot.js',
    "      const response = itName \n        ? `@${user} ${itName} is it!`\n        : `@${user} 🔥 FREE FOR ALL! Anyone can tag for DOUBLE POINTS! 🔥`;",
    "      const lastTagTime = Number(data?.lastTagTime || 0);\n      const elapsedMs = lastTagTime ? Math.max(0, Date.now() - lastTagTime) : 0;\n      const elapsedMinutes = Math.floor(elapsedMs / 60000);\n      const elapsedHours = Math.floor(elapsedMinutes / 60);\n      const elapsedDays = Math.floor(elapsedHours / 24);\n      const duration = !lastTagTime\n        ? 'for an unknown amount of time'\n        : elapsedDays > 0\n          ? `for ${elapsedDays}d ${elapsedHours % 24}h`\n          : elapsedHours > 0\n            ? `for ${elapsedHours}h ${elapsedMinutes % 60}m`\n            : elapsedMinutes > 0\n              ? `for ${elapsedMinutes}m`\n              : 'for less than a minute';\n      const response = itName \n        ? `@${user} ${itName} is it and has been it ${duration}!`\n        : `@${user} 🔥 FREE FOR ALL! Anyone can tag for DOUBLE POINTS! 🔥`;",
)

# Remove this one-time patch machinery from the resulting branch commit.
Path('scripts/apply-discord-tag-status-fix.py').unlink(missing_ok=True)
Path('.github/workflows/apply-discord-tag-status-fix.yml').unlink(missing_ok=True)
print('Discord tag/status fixes applied successfully.')
