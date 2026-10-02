// Uploads the converted character asset (apps/web/public/assets/characters/, gitignored) to the
// private Vercel Blob store. Needs BLOB_READ_WRITE_TOKEN in apps/web/.env.local.
//   pnpm --filter @legendes/web assets:upload

import { readFileSync } from 'node:fs';
import { put } from '@vercel/blob';

const version = process.env.CHARACTER_ASSETS_VERSION ?? 'v3';
const files = [
  ['player.glb', 'model/gltf-binary'],
  ['player.meta.json', 'application/json'],
] as const;

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('BLOB_READ_WRITE_TOKEN is missing (apps/web/.env.local).');
  process.exit(1);
}

for (const [name, contentType] of files) {
  const body = readFileSync(new URL(`../public/assets/characters/${name}`, import.meta.url));
  const blob = await put(`characters/${version}/${name}`, body, {
    access: 'private',
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  console.log(`${name} → ${blob.pathname} (${(body.byteLength / 1024).toFixed(0)} KB)`);
}
