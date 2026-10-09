// The cards a player owns, recomputed from their ids: the database stores ids, the picture of a
// card is drawn again from it (D-041).

import { findCard, type PackCard } from '@legendes/data';

/** The owned cards, in order (an id the game no longer knows is skipped). */
export const cardsOf = (cardIds: readonly string[]): PackCard[] =>
  cardIds.flatMap((id) => {
    const found = findCard(id);
    return found ? [found] : [];
  });
