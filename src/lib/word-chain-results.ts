export type WordChainResultMessage = {
  id: string;
  channel: string;
  message: string;
  expiresAt: number;
};

type Score = { displayName: string; points: number };

export function wordChainResultMessages(input: {
  channel: string; roundSlot: number; theme: string; roundParticipants: Score[];
  gameParticipants: Score[]; gameEnded: boolean; expiresAt: number;
}): WordChainResultMessage[] {
  const messages: string[] = [];
  const sortScores = (scores: Score[]) => [...scores].sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName));
  const appendScores = (heading: string, scores: Score[], ranked = false) => {
    let text = heading;
    scores.forEach((entry, index) => {
      const item = `${ranked ? `#${index + 1} ` : ''}${entry.displayName} (${entry.points} pts)`;
      if (text.length + item.length + 3 > 420) {
        messages.push(text);
        text = `${heading} continued: ${item}`;
      } else text += `${text === heading ? ' ' : ' · '}${item}`;
    });
    if (text !== heading) messages.push(text);
  };
  appendScores(`Word Chain round ${input.roundSlot % 5 + 1}/5 — ${input.theme}:`, sortScores(input.roundParticipants));
  const overall = sortScores(input.gameParticipants);
  appendScores(`Word Chain ${input.gameEnded ? 'FINAL ' : ''}overall top 3:`, overall.slice(0, 3), true);
  if (input.gameEnded) {
    const top = overall[0]?.points || 0;
    const winners = top > 0 ? overall.filter(entry => entry.points === top) : [];
    if (!winners.length) messages.push('Word Chain GAME OVER — no scored words this game.');
    else appendScores(winners.length > 1 ? 'Word Chain GAME OVER — tied winners:' : 'Word Chain GAME OVER — winner:', winners);
  }
  return messages.map((message, index) => ({ id: `wordchain:${input.channel}:${input.roundSlot}:${index}`,
    channel: input.channel, message, expiresAt: input.expiresAt }));
}
