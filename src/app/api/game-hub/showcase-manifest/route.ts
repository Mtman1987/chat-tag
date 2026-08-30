import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { GAME_HUB_CATALOG, type GameHubGame } from '@/lib/game-hub-registry';
import { getPublicAppOrigin } from '@/lib/public-origin';
import {
  NEBULA_GAMEPLAY_CAPTURE_SECONDS,
  NEBULA_GAMEPLAY_REVISION,
  NEBULA_GAMEPLAY_ROTATION_SECONDS,
} from '@/lib/nebula-gameplay-config';

export const dynamic = 'force-dynamic';

const PROTOTYPE_GAME_DIRECTORY = join(process.cwd(), 'public', 'nebula-arcade', 'games');

function normalizeGameId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\.html?$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function titleFromHtml(html: string, fallback: string) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = String(match?.[1] || '')
    .replace(/\s*[-|]\s*Social Stream Ninja\s*$/i, '')
    .trim();
  if (title) return title.slice(0, 100);
  return fallback
    .replace(/\.html?$/i, '')
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .slice(0, 100);
}

function prototypeFilename(game: GameHubGame) {
  return String(game.sourcePrototype || '').split('/').pop() || '';
}

function prototypeCaptureUrl(filename: string, id: string, origin: string) {
  const url = new URL(`/nebula-arcade/games/${encodeURIComponent(filename)}`, origin);
  url.searchParams.set('embedded', '1');
  url.searchParams.set('room', `nebula-showcase-${id}`);
  url.searchParams.set('demo', '1');
  return url.toString();
}

function nativeCaptureUrl(game: GameHubGame, origin: string) {
  return new URL(`/overlay/game-hub/showcase/${encodeURIComponent(game.id)}`, origin).toString();
}

async function discoverPrototypeGames(origin: string) {
  const filenames = (await readdir(PROTOTYPE_GAME_DIRECTORY).catch(() => [] as string[]))
    .filter((filename) => /\.html?$/i.test(filename))
    .sort((left, right) => left.localeCompare(right));
  const catalogByFilename = new Map(
    GAME_HUB_CATALOG
      .map((game, order) => ({ game, order, filename: prototypeFilename(game) }))
      .filter((entry) => entry.filename)
      .map((entry) => [entry.filename, entry] as const),
  );

  const discovered = [];
  for (let extraOrder = 0; extraOrder < filenames.length; extraOrder++) {
    const filename = filenames[extraOrder];
    const html = await readFile(join(PROTOTYPE_GAME_DIRECTORY, filename), 'utf8').catch(() => '');
    if (!html) continue;
    const catalogEntry = catalogByFilename.get(filename);
    const id = catalogEntry?.game.id || normalizeGameId(filename);
    if (!id) continue;
    const digest = createHash('sha256').update(html).digest('hex').slice(0, 20);
    discovered.push({
      id,
      name: catalogEntry?.game.name || titleFromHtml(html, filename),
      order: catalogEntry?.order ?? (GAME_HUB_CATALOG.length + extraOrder),
      revision: `html-${digest}`,
      captureSeconds: NEBULA_GAMEPLAY_CAPTURE_SECONDS,
      captureUrl: prototypeCaptureUrl(filename, id, origin),
      sourceKind: 'html' as const,
      sourceFile: filename,
    });
  }
  return discovered;
}

export async function GET(request: NextRequest) {
  const origin = getPublicAppOrigin() || request.nextUrl.origin;
  const fallbackImageUrl = new URL('/brand/nebula-arcade-games-showcase.gif?v=2', origin).toString();
  const prototypeGames = await discoverPrototypeGames(origin);
  const nativeGames = GAME_HUB_CATALOG
    .map((game, order) => ({ game, order }))
    .filter(({ game }) => !game.sourcePrototype)
    .map(({ game, order }) => ({
      id: game.id,
      name: game.name,
      order,
      revision: `native-${NEBULA_GAMEPLAY_REVISION}-${game.id}`,
      captureSeconds: NEBULA_GAMEPLAY_CAPTURE_SECONDS,
      captureUrl: nativeCaptureUrl(game, origin),
      sourceKind: 'native' as const,
    }));
  const games = [...prototypeGames, ...nativeGames]
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));

  return NextResponse.json({
    revision: NEBULA_GAMEPLAY_REVISION,
    cacheStrategy: 'capture-once-per-source-revision',
    captureSeconds: NEBULA_GAMEPLAY_CAPTURE_SECONDS,
    rotationSeconds: NEBULA_GAMEPLAY_ROTATION_SECONDS,
    fallbackImageUrl,
    games,
  }, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=300' },
  });
}
