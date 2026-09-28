import { commentary } from '@legendes/engine';
import { describe, expect, it } from 'vitest';
import messages from '../../messages/fr.json';

const lines = messages.commentary as Record<string, Record<string, string>>;
const allowed = new Set<string>(commentary.COMMENTARY_PARAMS);

describe('commentary messages', () => {
  it('has exactly the templates the engine can ask for', () => {
    expect(Object.keys(lines).sort()).toEqual(Object.keys(commentary.COMMENTARY_TEMPLATES).sort());
    for (const [category, count] of Object.entries(commentary.COMMENTARY_TEMPLATES)) {
      expect(Object.keys(lines[category] ?? {})).toHaveLength(count);
      for (let i = 0; i < count; i++)
        expect(lines[category]?.[String(i)]?.length).toBeGreaterThan(10);
    }
  });

  it('is a rich speaker: 150+ different lines', () => {
    const all = Object.values(lines).flatMap((v) => Object.values(v));
    expect(all.length).toBeGreaterThanOrEqual(150);
    expect(new Set(all).size).toBe(all.length);
  });

  it('only uses known placeholders, and no apostrophe breaks a placeholder', () => {
    for (const text of Object.values(lines).flatMap((v) => Object.values(v))) {
      for (const [, name] of text.matchAll(/\{(\w+)\}/g))
        expect(allowed.has(name ?? '')).toBe(true);
      expect(text).not.toMatch(/'\{/);
    }
  });

  it('never shows a forbidden brand (CLAUDE.md rule 4)', () => {
    const everything = JSON.stringify(messages);
    expect(everything).not.toMatch(/\bFIFA\b|\bFUT\b|Ultimate Team|EA SPORTS/i);
  });
});
