import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/quackverse/pack-preview/route';
import {
  normalizeQuackverseArtManifest,
  quackverseArtFileUrl,
  quackverseArtVersionForCard,
  quackverseArtVersionForCards,
} from '../src/lib/quackverse-art';

test('Quackverse pack preview renders a valid PNG response', async () => {
  const response = await GET(new NextRequest('http://localhost/api/quackverse/pack-preview?ids=1'));
  const bytes = await response.arrayBuffer();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /^image\/png/);
  assert.ok(bytes.byteLength > 1_000);
});

test('Quackverse art manifest helpers keep generated batches cacheable by timestamp', () => {
  const manifest = normalizeQuackverseArtManifest({
    1: {
      static: {
        fileName: '1/static.png',
        mimeType: 'image/png',
        originalName: 'old-field-ignored.png',
        updatedAt: '2026-08-31T01:00:00.000Z',
        url: '/old-public-url.png',
      },
    },
    2: {
      static: {
        fileName: '2/static.webp',
        mimeType: 'image/webp',
        originalName: 'generated.webp',
        updatedAt: '2026-08-31T02:00:00.000Z',
      },
    },
  });

  assert.equal((manifest['1']?.static as any)?.url, undefined);
  assert.equal(
    decodeURIComponent(quackverseArtFileUrl(1, 'static', quackverseArtVersionForCard(manifest, 1))),
    '/api/quackverse/art/file?cardId=1&variant=static&t=2026-08-31T01:00:00.000Z',
  );
  assert.equal(quackverseArtVersionForCards(manifest, [1, 2]), '2026-08-31T02:00:00.000Z');
});

test('Quackverse pack images resolve normalized generated art files, not stale public URLs', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/app/api/quackverse/pack/image/route.ts'), 'utf8');

  assert.match(source, /quackverseArtFileUrl/);
  assert.match(source, /manifest\[String\(cardId\)\]\?\.static/);
  assert.doesNotMatch(source, /static\?\.url/);
});
