'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { Card } from '@/lib/types';
import { rarityVar } from '@/lib/rarity';

interface CardImageProps {
  card: Card;
  className?: string;
}

// Displays a card's wiki image with a graceful fallback to a colored
// monogram tile when no image is available or it fails to load.
export function CardImage({ card, className }: CardImageProps) {
  const [errored, setErrored] = useState(false);
  const accent = rarityVar(card.rarity);
  const showImg = card.imageUrl && !errored;

  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted/40',
        className
      )}
      style={{
        background: `radial-gradient(circle at 50% 30%, ${accent.replace(')', ' / 0.15)')}, transparent 75%)`,
      }}
    >
      {showImg ? (
        <img
          src={card.imageUrl!}
          alt={card.name}
          className="h-full w-full object-contain"
          loading="lazy"
          onError={() => setErrored(true)}
        />
      ) : (
        <span
          className="text-lg font-black opacity-40"
          style={{ color: accent }}
        >
          {card.name.charAt(0)}
        </span>
      )}
    </div>
  );
}
