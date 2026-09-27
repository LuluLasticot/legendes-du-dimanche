import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { colors, radii } from '../src/tokens.ts';

const css = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');
const theme = readFileSync(new URL('../src/theme.css', import.meta.url), 'utf8');

describe('design tokens', () => {
  it.each(Object.entries(colors))(
    'colour %s is mirrored in tokens.css and theme.css',
    (name, value) => {
      expect(css).toContain(`--ld-color-${name}: ${value};`);
      expect(theme).toContain(`--color-${name}: var(--ld-color-${name});`);
    },
  );

  it.each(Object.entries(radii))('radius %s is mirrored', (name, value) => {
    expect(css).toContain(`--ld-radius-${name}: ${value};`);
    expect(theme).toContain(`--radius-${name}: var(--ld-radius-${name});`);
  });
});
