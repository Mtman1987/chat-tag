/**
 * Translate public Nebula Arcade commands into the legacy command syntax used
 * by the recovered HTML games. Ordinary chat is returned unchanged because
 * several games react to words, colours, emoji, or conversational messages.
 */
export function nebulaPrototypeMessage(gameIdValue: string, messageValue: string): string {
  const gameId = String(gameIdValue || '').trim().toLowerCase();
  const message = String(messageValue || '').trim();
  const command = message.match(/^!?@?spmt(?:\s+|$)(.*)$/i)?.[1]?.trim() || message;
  const parts = command.toLowerCase().split(/\s+/).filter(Boolean);
  const namespaces: Record<string, string[]> = {
    chaosmode: ['chaos', 'chaosmode'],
    chatwars: ['chatwars', 'wars'],
    chickenroyale: ['chicken', 'chickenroyale', 'royale'],
    dancingparade: ['parade', 'dancingparade'],
    emojitower: ['tower', 'emojitower'],
    petrace: ['pet', 'petrace', 'pets', 'race'],
    pixelbattle: ['pixel', 'pixelbattle'],
    treasurehunt: ['treasure', 'treasurehunt'],
  };
  const namespaced = Boolean(namespaces[gameId]?.includes(parts[0]) && parts.length > 1);
  if (namespaced) parts.shift();
  const action = parts[0] || '';

  if (gameId === 'chaosmode' && /^(explode|glitch|portal|shake)$/.test(action)) return `!${action}`;
  if (gameId === 'chatwars' && /^(red|blue|green|yellow)$/.test(action)) return `!${action}`;
  if (gameId === 'chickenroyale') {
    if (action === 'launch' || action === 'start') return '!start';
    if (/^(join|chicken|royale|hatch)$/.test(action)) return '!join';
  }
  if (gameId === 'dancingparade' && /^(join|dance|leave|parade)$/.test(action)) {
    return action === 'parade' ? '!join' : `!${action}`;
  }
  if (gameId === 'emojitower' && action === 'drop') return '!drop';
  if (gameId === 'petrace' && (namespaced || /^(pet|race|join)$/.test(action))) {
    const pet = namespaced ? action : parts[1];
    return `!join${pet ? ` ${pet}` : ''}`;
  }
  if (gameId === 'pixelbattle' && (namespaced || action === 'paint')) {
    return `paint ${namespaced ? parts.join(' ') : parts.slice(1).join(' ')}`.trim();
  }
  if (gameId === 'treasurehunt' && (namespaced || action === 'dig')) {
    const coordinate = namespaced ? action : parts[1];
    return `!dig${coordinate ? ` ${coordinate}` : ''}`;
  }
  return message;
}
