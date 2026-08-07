// Rarity styling helpers.
import type { Rarity } from './types';

export const RARITIES: Rarity[] = ['Common', 'Uncommon', 'Rare', 'Onyx'];

// Returns the CSS variable name for a rarity's accent color.
export function rarityVar(rarity: Rarity): string {
  return `var(--rarity-${rarity.toLowerCase()})`;
}

export function rarityFgVar(rarity: Rarity): string {
  return `var(--rarity-${rarity.toLowerCase()}-fg)`;
}

// Inline style for a rarity-colored border + subtle glow.
export function rarityBorderStyle(rarity: Rarity): React.CSSProperties {
  const color = rarityVar(rarity);
  return {
    borderColor: color,
    boxShadow: `0 0 0 1px ${color}, 0 4px 14px -6px ${color}`,
  };
}

// Tailwind classes for rarity badges (uses inline style for the actual color
// since Tailwind v4 can't generate dynamic class names from runtime values).
export function rarityBadgeClass(rarity: Rarity): string {
  // Solid colored badge
  return 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide';
}

export function rarityBadgeStyle(rarity: Rarity): React.CSSProperties {
  return {
    backgroundColor: rarityVar(rarity),
    color: rarityFgVar(rarity),
  };
}

// Numeric rarity code from spreadsheet
export const RARITY_CODE_TO_NAME: Record<number, Rarity> = {
  1: 'Common',
  2: 'Uncommon',
  3: 'Rare',
  4: 'Onyx',
};

export function rarityFromCode(code: number): Rarity {
  return RARITY_CODE_TO_NAME[code] ?? 'Common';
}
