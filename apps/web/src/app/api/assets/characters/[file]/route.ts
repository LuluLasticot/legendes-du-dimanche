// Serves the converted character asset from a private Vercel Blob store. The files are not in
// the public repository (derived from Mixamo, see docs/DECISIONS.md D-019); the read token
// stays on the server. Versioned paths → cached for a year on the CDN.

import { get } from '@vercel/blob';
import { NextResponse, type NextRequest } from 'next/server';

const FILES: Readonly<Record<string, string>> = {
  'player.glb': 'model/gltf-binary',
  'player.meta.json': 'application/json',
};

export async function GET(_request: NextRequest, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  const contentType = FILES[file];
  if (!contentType) return new NextResponse('Not found', { status: 404 });
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    return new NextResponse('Character assets are not configured', { status: 404 });
  }

  const version = process.env.CHARACTER_ASSETS_VERSION ?? 'v1';
  const result = await get(`characters/${version}/${file}`, { access: 'private' });
  if (result?.statusCode !== 200) return new NextResponse('Not found', { status: 404 });

  return new NextResponse(result.stream, {
    headers: {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=86400, s-maxage=31536000, immutable',
    },
  });
}
