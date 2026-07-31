from pathlib import Path

p = Path('src/app/api/discord/chat/route.ts')
text = p.read_text(encoding='utf-8')

def replace(old, new):
    global text
    if old not in text:
        raise SystemExit(f'Expected block not found: {old[:140]!r}')
    text = text.replace(old, new, 1)

replace(
"async function sendDiscordReply(channelId: string, content: string, context: DiscordReplyContext) {\n  const result = await sendDiscordMessage({",
"type DiscordPanelOptions = {\n  title?: string;\n  content?: string;\n  description?: string;\n  color?: number;\n  fields?: any[];\n  imageUrl?: string;\n  buttons?: Array<{ label: string; url: string; emoji?: string }>;\n};\n\nfunction linkButton(label: string, url: string, emoji?: string) {\n  return {\n    type: 2,\n    style: 5,\n    label: label.slice(0, 80),\n    url,\n    ...(emoji ? { emoji: { name: emoji } } : {}),\n  };\n}\n\nasync function sendDiscordPanel(channelId: string, context: DiscordReplyContext, options: DiscordPanelOptions) {\n  const components = options.buttons?.length\n    ? [{ type: 1, components: options.buttons.slice(0, 5).map((button) => linkButton(button.label, button.url, button.emoji)) }]\n    : undefined;\n  const result = await sendDiscordMessage({"
)
replace(
"    content: '',\n    username: CHAT_TAG_WEBHOOK_NAME,\n    embeds: [\n      {\n        title: 'Chat Tag',\n        description: content,\n        color: 0x00d9ff,",
"    content: options.content || '',\n    username: CHAT_TAG_WEBHOOK_NAME,\n    embeds: [\n      {\n        title: options.title || 'Chat Tag',\n        description: options.description || '',\n        color: options.color || 0x00d9ff,\n        ...(options.fields?.length ? { fields: options.fields } : {}),\n        ...(options.imageUrl ? { image: { url: options.imageUrl } } : {}),"
)
replace(
"    allowedMentions: { parse: [] },",
"    components,\n    allowedMentions: { parse: [] },"
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
"      title: `#${card?.id || '?'} ${card?.name || 'Unknown Card'}`,\n      description: `${card?.rarity || 'Unknown'} · ${card?.type || 'Quackverse'}`,”,
"      title: `Card ${index + 1}/${packCards.length} · #${card?.id || '?'} ${card?.name || 'Unknown Card'}`,\n      description: `${card?.rarity || 'Unknown'} · ${card?.type || 'Quackverse'}`,"
)
# The source uses a normal quote; repair smart-quote mismatch if needed.
text = text.replace("      description: `${card?.rarity || 'Unknown'} · ${card?.type || 'Quackverse'}`,\n", "      description: `${card?.rarity || 'Unknown'} · ${card?.type || 'Quackverse'}`,\n", 1)
replace(
"    embeds: [embed, ...cardEmbeds],\n    allowedMentions: { parse: [] },",
"    embeds: [embed, ...cardEmbeds],\n    components: [{\n      type: 1,\n      components: [\n        linkButton('Quackverse Guide', absolutePublicUrl(req, '/quackverse-guide'), '🦆'),\n        linkButton('My Collection', absolutePublicUrl(req, `/?player=${encodeURIComponent(userName)}`), '📚'),\n      ],\n    }],\n    allowedMentions: { parse: [] },"
)
replace(
"    if (cmd === 'pack' || cmd === 'quackpack') {",
"    if (cmd === 'collections' || cmd === 'collection' || cmd === 'cards') {\n      const quackIds = Array.isArray((player as any).quackverseCards)\n        ? (player as any).quackverseCards.map((id: any) => Number(id)).filter(Number.isFinite)\n        : Array.isArray((player as any).cards)\n          ? (player as any).cards.map((id: any) => Number(id)).filter(Number.isFinite)\n          : [];\n      const uniqueQuack = new Set(quackIds).size;\n      const totalQuackverse = quackverseCards.length;\n      const completion = totalQuackverse ? Math.round((uniqueQuack / totalQuackverse) * 100) : 0;\n      await sendDiscordPanel(channelId, replyContext, {\n        title: `📚 ${displayName}'s Card Collection`,\n        description: 'Your collection summary is kept short here. Use the buttons below for the full card browser and game guide.',\n        fields: [\n          { name: '🦆 Quackverse', value: `${quackIds.length} total cards\\n${uniqueQuack} unique cards\\n${completion}% complete`, inline: true },\n          { name: '🎟️ Chat Tag', value: `${Number(player.passCount || 0)}/3 passes\\n${player.isIt ? 'Currently IT' : 'Not currently IT'}\\n${player.sleepingImmunity || player.offlineImmunity ? 'Away / immune' : 'Active'}`, inline: true },\n          { name: '🔗 Full Collection', value: 'Open your full card browser instead of listing random cards in Discord.', inline: false },\n        ],\n        buttons: [\n          { label: 'Open My Collection', url: absolutePublicUrl(req, `/?player=${encodeURIComponent(displayName)}`), emoji: '📚' },\n          { label: 'Quackverse Guide', url: absolutePublicUrl(req, '/quackverse-guide'), emoji: '🦆' },\n          { label: 'Challenge a Player', url: absolutePublicUrl(req, '/card-table'), emoji: '⚔️' },\n        ],\n      });\n      return NextResponse.json({ success: true });\n    }\n\n    if (cmd === 'battle' || cmd === 'challenge' || cmd === 'play') {\n      const targetPlayer = args[1] ? findTargetPlayer(players, args[1], mentions) : null;\n      const targetName = targetPlayer?.twitchUsername || targetPlayer?.username || normalizeChatHandle(args[1]) || 'another player';\n      await sendDiscordPanel(channelId, replyContext, {\n        title: '⚔️ Card Battle Challenge',\n        description: targetPlayer\n          ? `**${displayName}** challenged **${targetName}** to a card-table match.`\n          : `**${displayName}** is looking for a card-table opponent. Use \\"spmt battle @player\\" to name someone.`,\n        fields: [\n          { name: 'Choose a Game', value: 'Pokémon or Quackverse', inline: true },\n          { name: 'Match Type', value: 'Casual, ranked, or tournament', inline: true },\n          { name: 'How it works', value: 'Open the shared table, choose your deck, then invite or seat the other player.', inline: false },\n        ],\n        buttons: [\n          { label: 'Open Battle Table', url: absolutePublicUrl(req, '/card-table'), emoji: '⚔️' },\n          { label: 'View My Collection', url: absolutePublicUrl(req, `/?player=${encodeURIComponent(displayName)}`), emoji: '📚' },\n          { label: 'Game Guide', url: absolutePublicUrl(req, '/quackverse-guide'), emoji: '📖' },\n        ],\n      });\n      return NextResponse.json({ success: true });\n    }\n\n    if (cmd === 'pokepack') {\n      await sendDiscordPanel(channelId, replyContext, {\n        title: '⚡ Pokémon Pack',\n        description: 'Pokémon packs are handled by the linked Pokédex/StreamWeaver collection. Open the Pokémon collection to use the real pack surface instead of posting a fake Discord result.',\n        buttons: [\n          { label: 'Open Pokémon Collection', url: absolutePublicUrl(req, `/?player=${encodeURIComponent(displayName)}&game=pokemon`), emoji: '⚡' },\n          { label: 'Challenge a Player', url: absolutePublicUrl(req, '/card-table?game=pokemon'), emoji: '⚔️' },\n        ],\n      });\n      return NextResponse.json({ success: true });\n    }\n\n    if (cmd === 'pack' || cmd === 'quackpack') {"
)
replace(
"    if (cmd === 'score' || cmd === 'rank') {",
"    if (cmd === 'score' || cmd === 'points' || cmd === 'rank' || cmd === 'leader' || cmd === 'pleader' || cmd === 'leaderboard') {"
)
replace(
"      if (cmd === 'score') {",
"      if (cmd === 'score' || cmd === 'points') {"
)
replace(
"        await reply(`@${userName} Rank: #${rank}/${allPlayers.length} | Score: ${myScore?.score || 0} pts | Tags: ${myScore?.tags || 0} | Tagged: ${myScore?.tagged || 0} | 🎟️ Pass: ${player.passCount || 0}/3`);",
"        await sendDiscordPanel(channelId, replyContext, {\n          title: `🏅 ${displayName}'s Chat Tag Stats`,\n          description: `You are ranked **#${rank} of ${allPlayers.length}**.`,\n          fields: [\n            { name: 'Points', value: `**${myScore?.score || 0}**`, inline: true },\n            { name: 'Successful Tags', value: `**${myScore?.tags || 0}**`, inline: true },\n            { name: 'Times Tagged', value: `**${myScore?.tagged || 0}**`, inline: true },\n            { name: 'Passes', value: `**${player.passCount || 0}/3**`, inline: true },\n          ],\n          buttons: [\n            { label: 'Full Leaderboard', url: absolutePublicUrl(req, '/'), emoji: '🏆' },\n            { label: 'My Collection', url: absolutePublicUrl(req, `/?player=${encodeURIComponent(displayName)}`), emoji: '📚' },\n            { label: 'Challenge Player', url: absolutePublicUrl(req, '/card-table'), emoji: '⚔️' },\n          ],\n        });"
)
replace(
"        await reply(`🏆 Top 3\\n${lines || 'No ranked players yet.'}${winnerLine}\\n\\nFull leaderboard: https://chat-tag-new.fly.dev/`);",
"        await sendDiscordPanel(channelId, replyContext, {\n          title: '🏆 Chat Tag Leaderboard',\n          description: `${lines || 'No ranked players yet.'}${winnerLine}`,\n          buttons: [\n            { label: 'Full Leaderboard', url: absolutePublicUrl(req, '/'), emoji: '🏆' },\n            { label: 'My Points', url: absolutePublicUrl(req, `/?player=${encodeURIComponent(displayName)}`), emoji: '🏅' },\n            { label: 'Challenge Player', url: absolutePublicUrl(req, '/card-table'), emoji: '⚔️' },\n          ],\n        });"
)
replace(
"    if (cmd === 'help') {\n      await reply(`@${userName} Commands: ${getPlayerHelpText()}`);",
"    if (cmd === 'help') {\n      await sendDiscordPanel(channelId, replyContext, {\n        title: '🚀 Chat Tag Command Center',\n        description: `Commands: ${getPlayerHelpText()}\\n\\nExtra Discord commands: \\"spmt collections\\" | \\"spmt points\\" | \\"spmt leaderboard\\" | \\"spmt battle @player\\" | \\"spmt quackpack\\" | \\"spmt pokepack\\"`,\n        buttons: [\n          { label: 'Dashboard', url: absolutePublicUrl(req, '/'), emoji: '🚀' },\n          { label: 'Collection', url: absolutePublicUrl(req, `/?player=${encodeURIComponent(displayName)}`), emoji: '📚' },\n          { label: 'Battle Table', url: absolutePublicUrl(req, '/card-table'), emoji: '⚔️' },\n          { label: 'Quackverse Guide', url: absolutePublicUrl(req, '/quackverse-guide'), emoji: '🦆' },\n        ],\n      });"
)

p.write_text(text, encoding='utf-8')
print('Discord command panels applied.')
