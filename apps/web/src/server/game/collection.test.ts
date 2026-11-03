import { openStarterPack, WORLD } from '@legendes/data';
import { describe, expect, it } from 'vitest';
import { cardsOf } from './collection.ts';

describe('cards of a collection', () => {
  it('rebuilds known cards in order, copies included, and skips unknown ids', () => {
    const ids = openStarterPack(WORLD.clubs[0]!, 's').cards.map((c) => c.card.id);
    const cards = cardsOf([...ids, ids[0]!, 'nobody-2026-27-99']);
    expect(cards.map((c) => c.card.id)).toEqual([...ids, ids[0]]);
  });
});
