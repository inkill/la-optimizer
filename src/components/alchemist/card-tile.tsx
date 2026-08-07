'use client';

import { cn } from '@/lib/utils';
import type { Card } from '@/lib/types';
import { rarityVar } from '@/lib/rarity';
import { RarityBadge } from './rarity-badge';
import { Plus, Layers, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

interface CardTileProps {
  card: Card;
  level?: number;
  fused?: boolean;
  quantity?: number;
  showActions?: boolean;
  inLibrary?: boolean;
  inDeck?: boolean;
  onAddToLibrary?: (card: Card) => void;
  onAddToDeck?: (card: Card) => void;
  onClick?: (card: Card) => void;
  compact?: boolean;
}

export function CardTile({
  card,
  level,
  fused,
  quantity,
  showActions,
  inLibrary,
  inDeck,
  onAddToLibrary,
  onAddToDeck,
  onClick,
  compact,
}: CardTileProps) {
  const accent = rarityVar(card.rarity);
  const [imgError, setImgError] = useState(false);
  const showImg = card.imageUrl && !imgError;

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-lg border bg-card/80 backdrop-blur transition-all',
        'hover:scale-[1.03] hover:shadow-lg cursor-pointer alchemist-fade-in',
        compact ? 'p-2' : 'p-2.5'
      )}
      style={{
        borderColor: accent,
        boxShadow: `inset 0 1px 0 0 ${accent.replace(')', ' / 0.15)')}`,
      }}
      onClick={() => onClick?.(card)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(card);
        }
      }}
    >
      {/* Rarity accent bar */}
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: accent }}
      />

      {/* Card image */}
      <div
        className="relative mb-2 flex aspect-[3/4] items-center justify-center overflow-hidden rounded-md bg-muted/40"
        style={{ background: `radial-gradient(circle at 50% 30%, ${accent.replace(')', ' / 0.12)')}, transparent 70%)` }}
      >
        {showImg ? (
          <img
            src={card.imageUrl!}
            alt={card.name}
            className="h-full w-full object-contain"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center">
            <span
              className="text-3xl font-black opacity-30"
              style={{ color: accent }}
            >
              {card.name.charAt(0)}
            </span>
          </div>
        )}
        {fused && (
          <div className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 shadow">
            <Sparkles className="h-3 w-3 text-amber-950" />
          </div>
        )}
        {(inDeck || inLibrary) && (
          <div className="absolute left-1 top-1">
            {inDeck ? (
              <span className="rounded bg-emerald-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-950">
                Deck
              </span>
            ) : (
              <span className="rounded bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-950">
                Own
              </span>
            )}
          </div>
        )}
      </div>

      {/* Name + badges */}
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold leading-tight text-foreground">
          {card.name}
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <RarityBadge rarity={card.rarity} className="scale-90 origin-left" />
          {level != null && (
            <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
              Lv{level}
            </span>
          )}
          {quantity != null && quantity > 1 && (
            <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
              ×{quantity}
            </span>
          )}
        </div>
      </div>

      {!compact && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
          <Layers className="h-2.5 w-2.5" />
          {card.comboCount} combos
        </div>
      )}

      {showActions && (
        <div className="mt-2 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
          {onAddToLibrary && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 flex-1 text-[11px]"
              onClick={() => onAddToLibrary(card)}
            >
              <Plus className="h-3 w-3" />
              Lib
            </Button>
          )}
          {onAddToDeck && (
            <Button
              size="sm"
              variant="secondary"
              className="h-7 flex-1 text-[11px]"
              onClick={() => onAddToDeck(card)}
              disabled={inDeck}
            >
              <Plus className="h-3 w-3" />
              Deck
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
