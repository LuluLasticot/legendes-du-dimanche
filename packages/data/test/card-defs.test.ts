import { describe, expect, it } from 'vitest';
import {
  allCardDefs,
  CARD_CLASSES,
  cardDefsSql,
  findCard,
  generateSquad,
  WORLD,
} from '../src/index.ts';

describe('card definitions', () => {
  const defs = allCardDefs();

  it('hold every card of the pilot, once', () => {
    const players = WORLD.clubs.reduce((n, club) => n + generateSquad(club).players.length, 0);
    expect(defs.length).toBeGreaterThanOrEqual(players * 2);
    expect(new Set(defs.map((d) => d.id)).size).toBe(defs.length);
    expect(defs.filter((d) => d.variant === 'base')).toHaveLength(players);
    expect(defs.filter((d) => d.variant === 'weekend')).toHaveLength(players);
  });

  it('are in a stable order', () => {
    const ids = defs.map((d) => d.id);
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
  });

  it('describe the card the game draws', () => {
    for (const def of defs.filter((_, i) => i % 97 === 0)) {
      const found = findCard(def.id);
      expect(found, def.id).not.toBeNull();
      expect(found?.card.player.rating).toBe(def.rating);
      expect(found?.club.id).toBe(def.clubId);
      expect(found?.card.player.positions[0]).toBe(def.position);
      expect(CARD_CLASSES).toContain(def.cardClass);
    }
  });

  it('make one insert statement per few hundred rows, one line per card', () => {
    const sql = cardDefsSql(defs);
    expect(sql.split('\n').filter((l) => l.startsWith("  ('"))).toHaveLength(defs.length);
    expect(sql).toContain('insert into public.card_defs');
    expect(sql).toContain('on conflict (id) do update');
  });
});
