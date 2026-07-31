from pathlib import Path

p = Path('src/app/api/discord/chat/route.ts')
text = p.read_text(encoding='utf-8')

def replace(old: str, new: str) -> None:
    global text
    if old not in text:
        raise SystemExit(f'Expected block not found: {old[:160]!r}')
    text = text.replace(old, new, 1)

replace(
"async function sendDiscordReply(channelId: string, content: string, context: DiscordReplyContext) {\n  const result = await sendDiscordMessage({\n    channelId,\n    content: '',\n    username: CHAT_TAG_WEBHOOK_NAME,\n    embeds: [\n      {\n        title: 'Chat Tag',\n        description: content,\n        color: 0x00d9ff,",
"type DiscordPanelOptions = {\n  title?: string;\n  description?: string;\n  fields?: any[];\n  buttons?: Array<{ label: string; url: string; emoji?: string }>;\n};\n\nfunction linkButton(label: string, url: string, emoji?: string) {\n  return { type: 2, style: 5, label: label.slice(0, 80), url, ...(emoji ? { emoji: { name: emoji } } : {}) };\n}\n\nasync function sendDiscordPanel(channelId: string, context: DiscordReplyContext, options: DiscordPanelOptions) {\n  const components = options.buttons?.length\n    ? [{ type: 1, components: options.buttons.slice(0, 5).map((button) => linkButton(button.label, button.url, button.emoji)) }]\n    : undefined;\n  const result = await sendDiscordMessage({\n    channelId,\n    content: '',\n    username: CHAT_TAG_WEBHOOK_NAME,\n    embeds: [\n      {\n        title: options.title || 'Chat Tag',\n        description: options.description || '',\n        color: 0x00d9ff,\n        ...(options.fields?.length ? { fields: options.fields } : {}),"
)
replace(
"    allowedMentions: { parse: [] },\n    botToken: DISCORD_BOT_TOKEN,\n    recordHistorySource: 'discord/chat',",
"    components,\n    allowedMentions: { parse: [] },\n    botToken: DISCORD_BOT_TOKEN,\n    recordHistorySource: 'discord/chat',"
)
replace(
"  return result;\n}\n\nfunction rarityBreakdown",
"  return result;\n}\n\nasync function sendDiscordReply(channelId: string, content: string, context: DiscordReplyContext) {\n  return sendDiscordPanel(channelId, context, { description: content });\n}\n\nfunction rarityBreakdown"
)
replace(
"  const packNames = packCards.map((card: any) => card?.name).filter(Boolean).slice(0, 5).join(', ') || 'pack opened';",
"  const packNames = packCards.map((card: any) => card?.name).filter(Boolean).join(', ') || 'pack opened';"
)
replace(
"  const cardEmbeds = packCards.slice(0, 5).map((card: any) => {",
"  const cardEmbeds = packCards.slice(0, 9).map((card: any, index: number) => {"
)
replace(
"      title: `#${card?.id || '?'} ${card?.name || 'Unknown Card'}`,",
"      title: `Card ${index + 1}/${packCards.length} · #${card?.id || '?'} ${card?.name || 'Unknown Card'}`,"
)
replace(
"    embeds: [embed, ...cardEmbeds],\n    allowedMentions: { parse: [] },",
"    embeds: [embed, ...cardEmbeds],\n    components: [{ type: 1, components: [\n      linkButton('Quackverse Guide', absolutePublicUrl(req, '/quackverse-guide'), '🦆'),\n      linkButton('My Collection', absolutePublicUrl(req, `/?player=${encodeURIComponent(userName)}`), '📚'),\n    ] }],\n    allowedMentions: { parse: [] },"
)
replace(
"    if (cmd === 'pack' || cmd === 'quackpack') {",
"    if (cmd === 'collections' || cmd === 'collection' || cmd === 'cards') {\n      const quackIds = Array.isArray((player as any).quackverseCards)\n        ? (player as any).quackverseCards.map(Number).filter(Number.isFinite)\n        : Array.isArray((player as any).cards)\n          ? (player as any).cards.map(Number).filter(Number.isFinite)\n          : [];\n      const uniqueQuack = new Set(quackIds).size;\n      const completion = quackverseCards.length ? Math.round((uniqueQuack / quackverseCards.length) * 100) : 0;\n      await sendDiscordPanel(channelId, replyContext, {\n        title: `📚 ${displayName}'s Collection`,\n        description: 'A quick summary, with links to the full collection instead of a random 25-card dump.',\n        fields: [\n          { name: '🦆 Quackverse', value: `${quackIds.length} total\\n${uniqueQuack} unique\\n${completion}% complete`, inline: true },\n          { name: '🎟️ Chat Tag', value: `${Number(player.passCount || 0)}/3 passes\\n${player.isIt ? 'Currently IT' : 'Not IT'}\\n${player.sleepingImmunity || player.offlineImmunity ? 'Away / immune' : 'Active'}`, inline: true },\n        ],\n        buttons: [\n          { label: 'Open My Collection', url: absolutePublicUrl(req, `/?player=${encodeURIComponent(displayName)}`), emoji: '📚' },\n          { label: 'Quackverse Guide', url: absolutePublicUrl(req, '/quackverse-guide'), emoji: '🦆' },\n          { label: 'Battle Table', url: absolutePublicUrl(req, '/card-table'), emoji: '⚔️' },\n        ],\n      });\n      return NextResponse.json({ success: true });\n    }\n\n    if (cmd === 'battle' || cmd === 'challenge' || cmd === 'play') {\n      const targetPlayer = args[1] ? findTargetPlayer(players, args[1], mentions) : null;\n      const targetName = targetPlayer?.twitchUsername || targetPlayer?.username || normalizeChatHandle(args[1]) || 'an opponent';\n      await sendDiscordPanel(channelId, replyContext, {\n        title: '⚔️ Card Battle Challenge',\n        description: targetPlayer ? `**${displayName}** challenged **${targetName}**.` : `**${displayName}** is looking for an opponent. Use \\"spmt battle @player\\" to name someone.`,\n        fields: [\n          { name: 'Games', value: 'Pokémon or Quackverse', inline: true },\n          { name: 'Match', value: 'Casual, ranked, or tournament', inline: true },\n        ],\n        buttons: [\n          { label: 'Open Battle Table', url: absolutePublicUrl(req, '/card-table'), emoji: '⚔️' },\n          { label: 'My Collection', url: absolutePublicUrl(req, `/?player=${encodeURIComponent(displayName)}`), emoji: '📚' },\n        ],\n      });\n      return NextResponse.json({ success: true });\n    }\n\n    if (cmd === 'pokepack') {\n      await sendDiscordPanel(channelId, replyContext, {\n        title: '⚡ Pokémon Pack',\n        description: 'Open the linked Pokémon collection to use the real pack and card-reveal surface.',\n        buttons: [\n          { label: 'Open Pokémon Collection', url: absolutePublicUrl(req, `/?player=${encodeURIComponent(displayName)}&game=pokemon`), emoji: '⚡' },\n          { label: 'Pokémon Battle', url: absolutePublicUrl(req, '/card-table?game=pokemon'), emoji: '⚔️' },\n        ],\n      });\n      return NextResponse.json({ success: true });\n    }\n\n    if (cmd === 'pack' || cmd === 'quackpack') {"
)
replace(
"    if (cmd === 'score' || cmd === 'rank') {",
"    if (cmd === 'score' || cmd === 'points' || cmd === 'rank' || cmd === 'leader' || cmd === 'pleader' || cmd === 'leaderboard') {"
)
replace("      if (cmd === 'score') {", "      if (cmd === 'score' || cmd === 'points') {")
replace(
"        await reply(`@${userName} Rank: #${rank}/${allPlayers.length} | Score: ${myScore?.score || 0} pts | Tags: ${myScore?.tags || 0} | Tagged: ${myScore?.tagged || 0} | 🎟️ Pass: ${player.passCount || 0}/3`);",
"        await sendDiscordPanel(channelId, replyContext, {\n          title: `🏅 ${displayName}'s Chat Tag Stats`,\n          description: `Ranked **#${rank} of ${allPlayers.length}**`,\n          fields: [\n            { name: 'Points', value: `**${myScore?.score || 0}**`, inline: true },\n            { name: 'Tags', value: `**${myScore?.tags || 0}**`, inline: true },\n            { name: 'Times Tagged', value: `**${myScore?.tagged || 0}**`, inline: true },\n            { name: 'Passes', value: `**${player.passCount || 0}/3**`, inline: true },\n          ],\n          buttons: [\n            { label: 'Full Leaderboard', url: absolutePublicUrl(req, '/'), emoji: '🏆' },\n            { label: 'My Collection', url: absolutePublicUrl(req, `/?player=${encodeURIComponent(displayName)}`), emoji: '📚' },\n            { label: 'Challenge Player', url: absolutePublicUrl(req, '/card-table'), emoji: '⚔️' },\n          ],\n        });"
)
replace(
"        await reply(`🏆 Top 3\\n${lines || 'No ranked players yet.'}${winnerLine}\\n\\nFull leaderboard: https://chat-tag-new.fly.dev/`);",
"        await sendDiscordPanel(channelId, replyContext, {\n          title: '🏆 Chat Tag Leaderboard',\n          description: `${lines || 'No ranked players yet.'}${winnerLine}`,\n          buttons: [\n            { label: 'Full Leaderboard', url: absolutePublicUrl(req, '/'), emoji: '🏆' },\n            { label: 'My Collection', url: absolutePublicUrl(req, `/?player=${encodeURIComponent(displayName)}`), emoji: '📚' },\n            { label: 'Challenge Player', url: absolutePublicUrl(req, '/card-table'), emoji: '⚔️' },\n          ],\n        });"
)
replace(
"    if (cmd === 'help') {\n      await reply(`@${userName} Commands: ${getPlayerHelpText()}`);",
"    if (cmd === 'help') {\n      await sendDiscordPanel(channelId, replyContext, {\n        title: '🚀 Chat Tag Command Center',\n        description: `Commands: ${getPlayerHelpText()}\\n\\nDiscord extras: collections | points | leaderboard | battle @player | quackpack | pokepack`,\n        buttons: [\n          { label: 'Dashboard', url: absolutePublicUrl(req, '/'), emoji: '🚀' },\n          { label: 'Collection', url: absolutePublicUrl(req, `/?player=${encodeURIComponent(displayName)}`), emoji: '📚' },\n          { label: 'Battle Table', url: absolutePublicUrl(req, '/card-table'), emoji: '⚔️' },\n        ],\n      });"
)

p.write_text(text, encoding='utf-8')
print('Discord command panels applied.')
