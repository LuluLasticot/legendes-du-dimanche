import { describe, expect, it } from 'vitest';
import { PACK_TYPES, toSvgString } from '@legendes/data';
import { PACK_HEIGHT, PACK_TEAR_V, packMaskNode, packNode, titleLines } from '../src/card/index.ts';

const labels = {
  title: 'Pack Or Premium',
  contents: '12 cartes or · 3 rares garanties',
  tearHere: 'Déchirer ici',
  odds: 'Probabilités affichées avant chaque ouverture',
  legal: "Jeu non officiel · aucun achat avec de l'argent réel",
};

function wellFormed(svg: string): boolean {
  const stack: string[] = [];
  for (const [, closing, name, selfClosing] of svg.matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g)) {
    if (selfClosing === '/') continue;
    if (closing === '/') {
      if (stack.pop() !== name) return false;
    } else stack.push(name as string);
  }
  return stack.length === 0;
}

describe('packs', () => {
  it.each([...PACK_TYPES])('%s: front, back and masks are well formed', (type) => {
    for (const back of [false, true]) {
      for (const node of [
        packNode(type, labels, 'p', back),
        packMaskNode(type, labels, 'p', back),
      ]) {
        const svg = toSvgString(node);
        expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 290 475"/);
        expect(svg).not.toMatch(/NaN|undefined|null/);
        expect(wellFormed(svg)).toBe(true);
        for (const [, ref] of svg.matchAll(/url\(#([^)]+)\)/g))
          expect(svg, `dangling reference ${ref}`).toContain(`id="${ref}"`);
      }
    }
  });

  it('print the dotted line where the 3D pack tears, and the pack name on the front', () => {
    const svg = toSvgString(packNode('gold', labels, 'p'));
    const y = PACK_HEIGHT * (1 - PACK_TEAR_V);
    expect(svg).toContain(`M6 ${Math.round(y * 100) / 100} H284`);
    expect(svg).toContain('stroke-dasharray="6 5"');
    expect(svg).toContain('>PACK OR<');
    expect(svg).toContain('>PREMIUM<');
    expect(toSvgString(packNode('gold', labels, 'p', true))).toContain(labels.odds);
  });

  it('fits every pack name in the panel, on two lines when it is long', () => {
    for (const title of ['Pack Bronze', 'Pack Argent', 'Pack Or', 'Pack Or Premium']) {
      const lines = titleLines(title);
      expect(lines.map((l) => l.text).join(' ')).toBe(title.toUpperCase());
      for (const { text, size } of lines)
        expect(text.length * size * 0.52).toBeLessThanOrEqual(220);
    }
    expect(titleLines('Pack Or Premium')).toHaveLength(2);
  });
});
