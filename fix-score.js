const fs = require('fs');
const f = 'c:\\Users\\mtman\\Desktop\\finished\\chat-tag\\bot.js';
let lines = fs.readFileSync(f, 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
  // Find the score command's apiCall line and add cache update after it
  if (lines[i].includes("else if (cmd === 'score')") && 
      lines[i+1]?.includes("const data = await apiCall('/api/tag')")) {
    // Insert updateWinnersCache after the apiCall
    lines.splice(i + 2, 0, "      updateWinnersCache(data);");
    console.log(`Added updateWinnersCache to score at line ${i + 3}`);
    break;
  }
}

// Now find the score reply line and add winner place
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("@${crown(user)} Rank: #${rank}")) {
    // Add winner indicator
    lines[i] = lines[i].replace(
      '| 🎟️ Pass: ${player.passCount || (player.hasPass ? 1 : 0)}/${3}`',
      '| 🎟️ Pass: ${player.passCount || (player.hasPass ? 1 : 0)}/${3}${(() => { const w = (data?.monthlyWinners || []).find(w => w.userId === userId); return w ? ` | 👑 #${w.place} Winner (${w.month})` : ""; })()}`'
    );
    console.log(`Added winner place to score reply at line ${i + 1}`);
    break;
  }
}

fs.writeFileSync(f, lines.join('\n'), 'utf8');
console.log('Done');
