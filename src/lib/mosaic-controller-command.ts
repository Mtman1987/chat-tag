/** Normalize only the explicit controller command form, never ordinary chat. */
export function normalizeControllerCommand(value: unknown, gameId: unknown) {
  let command = String(value || '').trim().slice(0, 400).replace(/^!?@?spmt(?:\s+|$)/i, '').replace(/^!/, '').trim();
  if (gameId === 'pixelbattle' && !/^mosaic(?:\s|$)/i.test(command)) {
    command = `mosaic ${command}`;
  }
  return command ? `spmt ${command}` : '';
}

/** Viewers may play the shared puzzle, but cannot manage another channel. */
export function isPlayerMosaicCommand(command: string) {
  const value = command.replace(/^spmt mosaic\s+/i, '').trim();
  return /^(?:reveal|queue|brush(?:\s+(?:[1-5]|off|left|right|up|down)){0,2}|(?:show|view)\s+(?:all|[1-4]))$/i.test(value)
    || /^(?:(?:paint|play)\s+)?[a-t]\s*(?:2[0-5]|1\d|[1-9])\s*(?:r|b|g|y|p|o|pk|w|k|c|red|blue|green|yellow|purple|orange|pink|white|black|cyan)$/i.test(value);
}
