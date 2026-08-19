'use client';

type Props = {
  profileId: string;
  profileName: string;
  overlayUrl: string;
};

const SPMT_OVERLAY_BAY = 'https://spmt.live/embed/overlays';

export function GameOverlayBayHandoff({ profileId, profileName, overlayUrl }: Props) {
  const openOverlayBay = () => {
    if (!overlayUrl) return;
    const target = new URL(SPMT_OVERLAY_BAY);
    target.searchParams.set('mode', 'full');
    target.searchParams.set('app', 'chat-tag');
    target.searchParams.set('sourceUrl', overlayUrl);
    target.searchParams.set('sourceTitle', profileName || 'Games Hub Overlay');
    target.searchParams.set('sourceKey', `chat-tag:games-overlay:${profileId}`);
    window.open(target.toString(), '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      type="button"
      onClick={openOverlayBay}
      disabled={!overlayUrl}
      className="rounded-lg border border-violet-300/25 bg-violet-300/10 px-3 py-2 text-xs font-bold text-violet-100 disabled:opacity-40"
    >
      Add to Overlay Bay
    </button>
  );
}
