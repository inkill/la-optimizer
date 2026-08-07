// Rarity styling helpers.
import type { Rarity } from './types';

// Rarity names use the in-game metal/gem naming (not the spreadsheet's
// Common/Uncommon/Rare/Onyx):
//   1 = Bronze  (was Common)
//   2 = Silver  (was Uncommon)
//   3 = Gold    (was Rare)
//   4 = Onyx    (highest tier)
export const RARITIES: Rarity[] = ['Bronze', 'Silver', 'Gold', 'Onyx'];

// Returns the CSS variable name for a rarity's accent color.
export function rarityVar(rarity: Rarity): string {
  return `var(--rarity-${rarity.toLowerCase()})`;
}

export function rarityFgVar(rarity: Rarity): string {
  return `var(--rarity-${rarity.toLowerCase()}-fg)`;
}

export function rarityBorderStyle(rarity: Rarity): React.CSSProperties {
  const color = rarityVar(rarity);
  return {
    borderColor: color,
    boxShadow: `0 0 0 1px ${color}, 0 4px 14px -6px ${color}`,
  };
}

export function rarityBadgeClass(rarity: Rarity): string {
  return 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide';
}

export function rarityBadgeStyle(rarity: Rarity): React.CSSProperties {
  return {
    backgroundColor: rarityVar(rarity),
    color: rarityFgVar(rarity),
  };
}

// Numeric rarity code from spreadsheet → metal/gem name
export const RARITY_CODE_TO_NAME: Record<number, Rarity> = {
  1: 'Bronze',
  2: 'Silver',
  3: 'Gold',
  4: 'Onyx',
};

export function rarityFromCode(code: number): Rarity {
  return RARITY_CODE_TO_NAME[code] ?? 'Bronze';
}
