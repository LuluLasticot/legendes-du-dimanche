// Turns the card's SVG (face, mask, back) into a canvas the GPU can sample. An SVG drawn as an
// image cannot see the page's fonts: the card's fonts are embedded as data URLs (loaded once).

export interface CardFont {
  /** Family name the SVG asks for ("Big Shoulders", "Manrope"). */
  readonly family: string;
  readonly weight: number;
  /** URL of a .woff or .woff2 file (same origin). */
  readonly url: string;
}

const fontCss = new Map<string, Promise<string>>();

async function toDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Font ${url}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const type = url.endsWith('.woff2') ? 'font/woff2' : 'font/woff';
  return `data:${type};base64,${btoa(binary)}`;
}

/** The @font-face rules of the card's fonts, with the files inlined. Cached per font list. */
export function cardFontCss(fonts: readonly CardFont[]): Promise<string> {
  const key = fonts.map((f) => `${f.family}:${f.weight}:${f.url}`).join('|');
  let css = fontCss.get(key);
  if (!css) {
    css = Promise.all(
      fonts.map(
        async (f) =>
          `@font-face{font-family:'${f.family}';font-weight:${f.weight};font-style:normal;src:url(${await toDataUrl(f.url)});}`,
      ),
    ).then((rules) => rules.join(''));
    // A failed load must not stay cached: the next card retries.
    css.catch(() => fontCss.delete(key));
    fontCss.set(key, css);
  }
  return css;
}

/** Draws an SVG document on a canvas `width` pixels wide (height from the viewBox ratio). */
export async function rasterizeSvg(
  svg: string,
  width: number,
  height: number,
  css = '',
): Promise<HTMLCanvasElement> {
  const withFonts = css === '' ? svg : svg.replace(/^(<svg[^>]*>)/, `$1<style>${css}</style>`);
  const image = new Image();
  image.decoding = 'async';
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(withFonts)}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas unavailable');
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}
