'use client';

import { cn } from '@/lib/utils';
import type { Rarity } from '@/lib/types';
import { rarityBadgeClass, rarityBadgeStyle } from '@/lib/rarity';

interface RarityBadgeProps {
  rarity: Rarity;
  className?: string;
  children?: React.ReactNode;
}

export function RarityBadge({ rarity, className, children }: RarityBadgeProps) {
  return (
    <span
      className={cn(rarityBadgeClass(rarity), className)}
      style={rarityBadgeStyle(rarity)}
    >
      {children ?? rarity}
    </span>
  );
}
