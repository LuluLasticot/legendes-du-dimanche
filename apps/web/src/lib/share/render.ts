// Share images as PNG, on the server: the SVG tree of the card or club (`@legendes/ui/card`)
// drawn by resvg with the game's fonts. next/og cannot be used: the text of an SVG nested in
// its layout falls back on a system font (checked: the card lost Big Shoulders), and the card
// must be the card of the game.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { toSvgString, type SvgElement } from '@legendes/data';
import { woffToSfnt } from './woff';

const FONT_DIR = join(process.cwd(), 'public', 'fonts');

let fonts: Promise<string[]> | null = null;

/**
 * The game's fonts (OFL, `public/fonts`), unpacked to TrueType once per server instance in the
 * temporary directory (resvg reads font files, not WOFF).
 */
function loadFonts(): Promise<string[]> {
  fonts ??= (async () => {
    const dir = join(tmpdir(), 'legendes-fonts');
    await mkdir(dir, { recursive: true });
    const files = (await readdir(FONT_DIR)).filter((file) => file.endsWith('.woff'));
    return Promise.all(
      files.map(async (file) => {
        const path = join(dir, file.replace(/\.woff$/, '.ttf'));
        await writeFile(path, woffToSfnt(await readFile(join(FONT_DIR, file))));
        return path;
      }),
    );
  })();
  // A failed load must not stay cached: the next image retries.
  fonts.catch(() => {
    fonts = null;
  });
  return fonts;
}

/** Draws an SVG tree as a PNG of its own size (`scale` > 1 for a sharper image). */
export async function renderPng(node: SvgElement, scale = 1): Promise<Buffer> {
  const width = Number(node.attrs['width']);
  const resvg = new Resvg(toSvgString(node), {
    fitTo: { mode: 'width', value: Math.round(width * scale) },
    font: { fontFiles: await loadFonts(), loadSystemFonts: false, defaultFontFamily: 'Manrope' },
  });
  return resvg.render().asPng();
}

/**
 * A link preview as JPEG: the PNG of a card weighs ~400 KB, and WhatsApp drops previews above
 * ~300 KB. Quality 86 keeps the card's text and metal clean at ~100 KB.
 */
export async function toJpeg(png: Buffer): Promise<Buffer> {
  return sharp(png).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
}

/** An image response, cached by the CDN: the same id always draws the same image. */
export function imageResponse(
  body: Buffer,
  type: 'image/png' | 'image/jpeg',
  filename?: string,
): Response {
  const headers: Record<string, string> = {
    'Content-Type': type,
    'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
  };
  if (filename) headers['Content-Disposition'] = `inline; filename="${filename}"`;
  return new Response(new Uint8Array(body), { headers });
}
