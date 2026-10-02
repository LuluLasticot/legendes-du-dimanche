// Turning a card (or a pack) into the textures of its 3D version: the same SVG as the 2D card,
// drawn on canvases with the card's fonts embedded (D-035). Browser only.

import { toSvgString, type SvgElement } from '@legendes/data';
import type * as Render3DModule from '@legendes/render3d';
import type { Card3DSources, CardFont } from '@legendes/render3d';
import {
  CARD_FINISHES,
  cardBackMaskNode,
  cardBackNode,
  cardMaskNode,
  cardNode,
  DEFAULT_CARD_TUNING,
  silhouette,
  type CardFace,
  type CardLook,
} from '@legendes/ui/card';

type Render3D = typeof Render3DModule;

/** The card's fonts (OFL, `public/fonts`). */
export const CARD_FONT_FILES: readonly CardFont[] = [
  { family: 'Big Shoulders', weight: 700, url: '/fonts/big-shoulders-latin-700-normal.woff' },
  { family: 'Big Shoulders', weight: 800, url: '/fonts/big-shoulders-latin-800-normal.woff' },
  { family: 'Big Shoulders', weight: 900, url: '/fonts/big-shoulders-latin-900-normal.woff' },
  { family: 'Manrope', weight: 700, url: '/fonts/manrope-latin-700-normal.woff' },
  { family: 'Manrope', weight: 800, url: '/fonts/manrope-latin-800-normal.woff' },
];

/** Draws an SVG tree on a canvas `width` pixels wide, keeping the viewBox's ratio. */
export function rasterize(
  render3d: Render3D,
  node: SvgElement,
  width: number,
  css: string,
): Promise<HTMLCanvasElement> {
  const [, , w, h] = String(node.attrs['viewBox'] ?? '0 0 1 1')
    .split(' ')
    .map(Number) as [number, number, number, number];
  return render3d.rasterizeSvg(toSvgString(node), width, Math.round((width * h) / w), css);
}

/**
 * The textures of a card: face and mask at `width` pixels (the mask at half), and its back.
 * Backs are shared by the cards of a template: pass the same `backs` map to reuse them.
 */
export async function cardSources(
  render3d: Render3D,
  face: CardFace,
  width: number,
  css: string,
  backs?: Map<string, Promise<readonly [HTMLCanvasElement, HTMLCanvasElement]>>,
): Promise<Card3DSources> {
  const look: CardLook = face.look;
  const backKey = `${look}:${width}`;
  let back = backs?.get(backKey);
  if (!back) {
    back = Promise.all([
      rasterize(render3d, cardBackNode(look, `back-${look}`), width, css),
      rasterize(render3d, cardBackMaskNode(look, `back-${look}`), Math.round(width / 2), css),
    ]);
    backs?.set(backKey, back);
  }
  const [faceTex, faceMask, [backTex, backMask]] = await Promise.all([
    // No painted sheen nor grain: the shader lights the card (and the grain's blending is lost
    // when an SVG is drawn as an image).
    rasterize(render3d, cardNode(face, { ...DEFAULT_CARD_TUNING, sheen: 0, grain: 0 }), width, css),
    rasterize(render3d, cardMaskNode(face), Math.round(width / 2), css),
    back,
  ]);
  return {
    outline: silhouette(0),
    face: faceTex,
    faceMask,
    back: backTex,
    backMask,
    finish: CARD_FINISHES[look],
  };
}
