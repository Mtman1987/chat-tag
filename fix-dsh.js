const fs = require('fs');
const f = 'c:\\Users\\mtman\\Desktop\\finished\\DiscordStreamHub\\src\\lib\\chat-tag-service.ts';
let lines = fs.readFileSync(f, 'utf8').split('\n');
let changes = 0;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("const bingo = gameState.bingo;")) {
    lines[i] = ''; changes++;
  }
  if (lines[i].includes("const bingoLine = bingo?.phrases?.length")) {
    lines[i] = '';
    if (lines[i+1]?.includes("claimedCount")) lines[i+1] = '';
    if (lines[i+2]?.includes("No bingo card active")) lines[i+2] = '';
    changes++;
  }
  if (lines[i].includes("{ name: '🎲 Bingo', value: bingoLine, inline: true },")) {
    lines[i] = "        { name: '📺 Overlay', value: '[Add to OBS](https://tinyurl.com/spmt-overlay)', inline: true },";
    changes++;
  }
  if (lines[i].includes("Type @spmt help for commands")) {
    lines[i] = lines[i].replace("Type @spmt help", "Type spmt help");
    changes++;
  }
  if (lines[i].includes("label: 'Sleep / Wake'")) {
    lines[i] = lines[i].replace("Sleep / Wake", "Away");
    changes++;
  }
  if (lines[i].includes("Bingo: ${gameState.bingo")) {
    lines[i] = ''; changes++;
  }
  if (lines[i].includes("New Bingo Card")) {
    lines[i] = ''; changes++;
  }
}

fs.writeFileSync(f, lines.join('\n'), 'utf8');
console.log('Done:', changes, 'changes');
