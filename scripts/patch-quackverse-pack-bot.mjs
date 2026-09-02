import fs from 'node:fs';

const path = 'bot.js';
let source = fs.readFileSync(path, 'utf8');

const already = 'PACK_PRESENT_CANONICAL_WEB_ROUTE';
if (source.includes(already)) {
  console.log('Quackverse bot pack presenter patch already applied');
  process.exit(0);
}

const before = `      const rarityCounts = packCards.reduce((acc, card) => {\n        const rarity = card?.rarity || 'Unknown';\n        acc[rarity] = (acc[rarity] || 0) + 1;\n        return acc;\n      }, {});\n      const packCardLines = packCards.map((card) => \`${'${card?.name || \'Unknown\'}'} (${'${card?.rarity || \'Unknown\'}'})\`).join('\\n') || 'pack opened';\n      const collectionCards = Array.isArray(res?.cards) ? res.cards : [];\n      const collectionTotal = collectionCards.length;\n      const collectionUnique = new Set(collectionCards).size;\n      const rarityText = Object.entries(rarityCounts)\n        .map(([rarity, count]) => \`${'${rarity}'}: ${'${count}'}\`)\n        .join(' | ') || 'Unknown';\n\n      if (packCards.length > 0) {\n        const cardEmbeds = packCards.slice(0, 5).map((card) => ({\n          title: \`#${'${card?.id || \'?\'}'} ${'${card?.name || \'Unknown Card\'}'}\`,\n          description: \`${'${card?.rarity || \'Unknown\'}'} · ${'${card?.type || \'Quackverse\'}'}\`,\n          color: 0x00d9ff,\n          image: { url: card?.cardImageUrl },\n        })).filter((embed) => embed.image.url);\n        const announceRes = await apiCall('/api/discord/announce', {\n          method: 'POST',\n          headers: { 'Content-Type': 'application/json' },\n          body: JSON.stringify({\n            embeds: [\n              {\n                title: '🦆 Quackverse Pack Opened',\n                description: \`**@${'${user}'}** opened a Quackverse pack: ${'${packNames}'}. ${'${Number(res?.packsRemaining || 0)}'}/3 packs left today.\`,\n                color: 0x00d9ff,\n                fields: [\n                  { name: 'Pack', value: packCardLines, inline: false },\n                  { name: 'Collection', value: \`${'${collectionTotal}'} total cards | ${'${collectionUnique}'} unique\`, inline: true },\n                  { name: 'Rarity Breakdown', value: rarityText, inline: false },\n                ],\n                footer: { text: 'SPMT Chat Tag' },\n              },\n              ...cardEmbeds,\n            ],\n          }),\n        });\n        if (announceRes?.__ok === false || announceRes?.success === false) {\n          console.error(\`[Bot] Quackverse Discord announcement failed: ${'${announceRes?.error || announceRes?.__status || \'unknown error\'}'}\`);\n        }\n      }`;

const after = `      if (packCards.length > 0 && res?.packId) {\n        // PACK_PRESENT_CANONICAL_WEB_ROUTE: the web app owns the one Discord\n        // message, GIF render/edit, failure state and ten-minute cleanup.\n        // This does not reopen the pack; it only presents the cards just drawn.\n        void apiCall('/api/quackverse/pack/present', {\n          method: 'POST',\n          headers: { 'Content-Type': 'application/json' },\n          body: JSON.stringify({\n            packId: res.packId,\n            username: user,\n            pack: packCards,\n            packsRemaining: Number(res?.packsRemaining || 0),\n            cards: Array.isArray(res?.cards) ? res.cards : [],\n          }),\n        }).then((presented) => {\n          if (presented?.__ok === false || presented?.success === false) {\n            console.error(\`[Bot] Quackverse pack presentation failed: ${'${presented?.error || presented?.render?.error || presented?.__status || \'unknown error\'}'}\`);\n          }\n        }).catch((error) => {\n          console.error('[Bot] Quackverse pack presentation request failed:', error?.message || error);\n        });\n      }`;

if (!source.includes(before)) {
  throw new Error('Quackverse bot pack presenter patch target missing');
}
source = source.replace(before, after);
fs.writeFileSync(path, source);
console.log('Quackverse bot pack presenter patch applied');
