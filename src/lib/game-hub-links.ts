export type GameHubLinks = {
  interactiveBoardUrl: string;
  obsOverlayUrl: string;
};

function normalizeChannel(value: unknown): string {
  const channel = String(value || '').trim().toLowerCase().replace(/^#/, '');
  if (!/^[a-z0-9_]{1,25}$/.test(channel)) {
    throw new Error('A valid Twitch channel is required to build game links.');
  }
  return channel;
}

export function buildGameHubLinks(originValue: string, channelValue: unknown, gameIdValue: unknown): GameHubLinks {
  const origin = new URL(originValue);
  const channel = normalizeChannel(channelValue);
  const gameId = String(gameIdValue || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{1,40}$/.test(gameId)) {
    throw new Error('A valid game ID is required to build game links.');
  }

  const interactiveBoard = new URL(`/games/${encodeURIComponent(gameId)}`, origin);
  interactiveBoard.searchParams.set('channel', channel);
  // Quackverse is room-scoped; make the default room explicit instead of
  // relying on a different tenant or the viewer's previous browser state.
  if (gameId === 'quackverse') interactiveBoard.searchParams.set('roomId', 'default');

  const obsOverlay = new URL(`/overlay/game-hub/instant.${channel}.${gameId}`, origin);
  return {
    interactiveBoardUrl: interactiveBoard.toString(),
    obsOverlayUrl: obsOverlay.toString(),
  };
}
