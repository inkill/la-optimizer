// Shared TypeScript types for the Little Alchemist app.

export type Rarity = 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

export interface Card {
  id: number;
  name: string;
  rarity: Rarity;
  comboCount: number;
  imageUrl?: string | null;
}

export interface Combination {
  id: number;
  comboNum: number;
  comboId: number;
  cardAId: number;
  cardBId: number;
  resultName: string;
  resultRarity: number;
  comboRarity: number;
  ba0: number; ba1: number; ba2: number;
  bd0: number; bd1: number; bd2: number;
  cardA: Card;
  cardB: Card;
}

export interface User {
  id: string;
  name: string;
  createdAt: string;
}

// A library or deck item. `quantity` is 1-3 copies; fused1/2/3 track whether
// copy N is fused (only meaningful when quantity >= N).
export interface CardItem {
  id: string;
  cardId: number;
  card: Card;
  level: number;
  quantity: number;
  fused1: boolean;
  fused2: boolean;
  fused3: boolean;
  position?: number;
  createdAt: string;
  updatedAt: string;
}

export type LibraryItem = CardItem;
export type DeckItem = CardItem;

export interface Deck {
  id: string;
  name: string;
  userId: string;
  isActive: boolean;
  size?: number;
  createdAt: string;
  updatedAt: string;
  items?: DeckItem[];
}

export interface OptimizeResult {
  mode: 'sum' | 'attack' | 'defence';
  score: number;
  deckSize: number;
  breakdown: {
    comboCount: number;
    fusedCount: number;
    rarityCounts: Record<string, number>;
  };
  pairs: Array<{
    a: string; b: string; result: string; resultRarity: number;
    ba: number; bd: number; contribution: number;
  }>;
  suggestions: Array<{
    cardId: number; name: string; rarity: Rarity; level: number; fused: boolean; gain: number;
  }>;
}

export interface AutoFillResult {
  algorithm: 'quick' | 'advanced' | 'try-all';
  mode: 'sum' | 'attack' | 'defence';
  score: number;
  iterations: number;
  durationMs: number;
  deck: DeckItem[];
  deckSize: number;
}

export interface Stats {
  totalCards: number;
  totalCombos: number;
  libraryCount: number;
  deckCount: number;
  deckCountUnique: number;
  isLoggedIn: boolean;
  rarityCounts: Record<string, number>;
  topCards: Array<{ id: number; name: string; rarity: Rarity; comboCount: number; imageUrl?: string | null }>;
  topResults: Array<{ name: string; count: number }>;
}

export const DECK_MAX_SIZE = 30;
export const MAX_COPIES_PER_CARD = 3;
