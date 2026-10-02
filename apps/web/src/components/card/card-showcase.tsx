'use client';

import type { Card, Club } from '@legendes/data';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PlayerCard } from './player-card';

// The 3D viewer (Three.js) loads only when asked for.
const CardViewer3D = dynamic(() => import('./card-viewer-3d').then((m) => m.CardViewer3D), {
  ssr: false,
});

/** A card on its public page: the 2D card, or the 3D one on demand. */
export function CardShowcase({ card, club }: { card: Card; club: Club }) {
  const t = useTranslations('cardPage');
  const [threeD, setThreeD] = useState(false);
  return (
    <div className="flex flex-col items-center gap-4 md:sticky md:top-10">
      {threeD ? (
        <div className="aspect-[5/7] w-full max-w-sm">
          <CardViewer3D card={card} club={club} revealOnOpen={false} />
        </div>
      ) : (
        <PlayerCard
          card={card}
          club={club}
          className="w-full max-w-sm drop-shadow-[0_24px_40px_rgb(0_0_0/0.6)]"
        />
      )}
      <button
        type="button"
        onClick={() => setThreeD(!threeD)}
        className="rounded-pill border border-chalk/20 px-4 py-2 text-sm font-semibold text-chalk hover:border-floodlight-400"
      >
        {threeD ? t('view2d') : t('view3d')}
      </button>
    </div>
  );
}
