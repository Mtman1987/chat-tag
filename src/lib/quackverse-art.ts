export type QuackverseArtVariant = 'static' | 'hover';

export type QuackverseArtAsset = {
  fileName: string;
  mimeType: string;
  originalName: string;
  updatedAt: string;
};

export type QuackverseArtEntry = Partial<Record<QuackverseArtVariant, QuackverseArtAsset>>;
export type QuackverseArtManifest = Record<string, QuackverseArtEntry>;

export function quackverseArtFileUrl(cardId: number, variant: QuackverseArtVariant, updatedAt = '') {
  const url = new URL('/api/quackverse/art/file', 'http://local');
  url.searchParams.set('cardId', String(cardId));
  url.searchParams.set('variant', variant);
  if (updatedAt) url.searchParams.set('t', updatedAt);
  return `${url.pathname}${url.search}`;
}

function manifestCardKey(cardId: unknown) {
  const numeric = Number(cardId);
  if (!Number.isFinite(numeric) || numeric < 1) return '';
  return String(numeric);
}

export function quackverseArtVersionForCard(
  manifest: QuackverseArtManifest,
  cardId: unknown,
  variant: QuackverseArtVariant = 'static',
) {
  const key = manifestCardKey(cardId);
  return key ? manifest[key]?.[variant]?.updatedAt || '' : '';
}

export function quackverseArtVersionForCards(
  manifest: QuackverseArtManifest,
  cardIds: readonly unknown[],
  variant: QuackverseArtVariant = 'static',
) {
  const versions = cardIds
    .map((cardId) => quackverseArtVersionForCard(manifest, cardId, variant))
    .filter(Boolean);
  versions.sort();
  return versions[versions.length - 1] || '';
}

export function normalizeQuackverseArtManifest(value: unknown): QuackverseArtManifest {
  if (!value || typeof value !== 'object') return {};

  const manifest: QuackverseArtManifest = {};
  for (const [cardId, entry] of Object.entries(value as Record<string, any>)) {
    if (!entry || typeof entry !== 'object') continue;
    const normalized: QuackverseArtEntry = {};
    for (const variant of ['static', 'hover'] as QuackverseArtVariant[]) {
      const asset = entry[variant];
      if (!asset || typeof asset !== 'object') continue;
      if (
        typeof asset.fileName === 'string' &&
        typeof asset.mimeType === 'string' &&
        typeof asset.originalName === 'string' &&
        typeof asset.updatedAt === 'string'
      ) {
        normalized[variant] = {
          fileName: asset.fileName,
          mimeType: asset.mimeType,
          originalName: asset.originalName,
          updatedAt: asset.updatedAt,
        };
      }
    }
    if (Object.keys(normalized).length > 0) manifest[cardId] = normalized;
  }
  return manifest;
}
