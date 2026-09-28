// Serves the converted character asset from a private Vercel Blob store. The files are not in
// the public repository (derived from Mixamo, see docs/DECISIONS.md D-019); the read token
// stays on the server. Versioned paths → cached for a year on the CDN. Without a store (local
// development without a token), it points to the local copy in public/, if there is one.

import { get } from '@vercel/blob';
import { NextResponse, type NextRequest } from 'next/server';

const FILES: Readonly<Record<string, string>> = {
  'player.glb': 'model/gltf-binary',
  'player.meta.json': 'application/json',
};

export async function GET(request: NextRequest, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  const contentType = FILES[file];
  if (!contentType) return new NextResponse('Not found', { status: 404 });
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    const local = NextResponse.redirect(new URL(`/assets/characters/${file}`, request.url), 307);
    local.headers.set('Cache-Control', 'no-store');
    return local;
  }

  const version = process.env.CHARACTER_ASSETS_VERSION ?? 'v2';
  let result: Awaited<ReturnType<typeof get>>;
  try {
    result = await get(`characters/${version}/${file}`, { access: 'private' });
  } catch (error) {
    console.error('[characters] blob read failed', error);
    return new NextResponse('Not found', { status: 404 });
  }
  if (result?.statusCode !== 200) return new NextResponse('Not found', { status: 404 });

  return new NextResponse(result.stream, {
    headers: {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=86400, s-maxage=31536000, immutable',
    },
  });
}
