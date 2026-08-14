// API client for the Little Alchemist app.
// On GitHub Pages (static hosting), all data is client-side:
//   - Static catalog (cards, combinations) is loaded from /data/*.json
//   - User data (library, decks, accounts) is stored in localStorage
//
// The function signatures match the old server-based API so the UI components
// don't need to change.

import type {
  AutoFillResult,
  Card,
  Combination,
  Deck,
  DeckItem,
  LibraryItem,
  OptimizeResult,
  Stats,
  User,
} from './types';
import { MAX_COPIES_PER_CARD } from './types';
import * as store from './client-store';
import {
  buildComboMap,
  quickFill,
  advancedFill,
  tryAllFill,
  expandItem,
  collapseInstances,
  scoreDeck,
  scoreLibraryCard,
  calculateFusionBuff,
  setBaseIdResolver,
  type OptimizeMode,
  type Candidate,
  type CardInstance,
  type ScoringParams,
  DEFAULT_SCORING_PARAMS,
  DECK_MAX_SIZE,
} from './optimizer';

// Helper: check if a card is Onyx (name contains ":")
function isOnyx(cardName: string): boolean {
  return cardName.includes(':');
}

// Helper: expand a library/deck item into CardInstances with onyx + level
function expandItemWithMeta(item: {
  cardId: number;
  quantity: number;
  fused1: boolean;
  fused2: boolean;
  fused3: boolean;
  level: number;
  card?: { name?: string };
}): CardInstance[] {
  const cardName = item.card?.name ?? '';
  return expandItem({
    cardId: item.cardId,
    quantity: item.quantity,
    fused1: item.fused1,
    fused2: item.fused2,
    fused3: item.fused3,
    level: item.level,
    onyx: isOnyx(cardName),
  });
}

// ===== Auth =====
export function getStoredUserId(): string | null {
  return store.getStoredUserId();
}
export function setStoredUserId(id: string) {
  store.setStoredUserId(id);
}
export function clearStoredUserId() {
  store.clearStoredUserId();
}

export async function guestLogin(): Promise<{ user: User; isNew: boolean }> {
  await store.getCards(); // ensure card cache is warm
  const user = await store.createGuestUser();
  return { user, isNew: true };
}

export async function register(name: string) {
  const result = store.registerUser(name);
  return result;
}

export async function logout() {
  store.logoutUser();
  return { ok: true };
}

export async function fetchMe(): Promise<User | null> {
  await store.getCards();
  return store.getCurrentUserSync();
}

// ===== Cards =====
export interface CardQuery {
  q?: string;
  rarity?: string;
  sort?: 'name' | 'rarity' | 'comboCount';
  dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export async function fetchCards(query: CardQuery = {}) {
  let cards = await store.getCards();
  const q = query.q?.trim().toLowerCase();
  if (q) cards = cards.filter((c) => c.name.toLowerCase().includes(q));
  if (query.rarity && query.rarity !== 'all') cards = cards.filter((c) => c.rarity === query.rarity);
  const sort = query.sort ?? 'name';
  const dir = query.dir ?? 'asc';
  const mult = dir === 'asc' ? 1 : -1;
  cards = [...cards].sort((a, b) => {
    if (sort === 'rarity') return mult * a.rarity.localeCompare(b.rarity);
    if (sort === 'comboCount') return mult * (a.comboCount - b.comboCount);
    return mult * a.name.localeCompare(b.name);
  });
  const total = cards.length;
  const offset = query.offset ?? 0;
  const limit = query.limit ?? 1000;
  return { cards: cards.slice(offset, offset + limit), total, limit, offset };
}

export async function fetchCardDetail(id: number) {
  const cards = await store.getCards();
  const card = cards.find((c) => c.id === id);
  if (!card) throw new Error('Card not found');
  await store.getCombos();
  const comboMap = store.getComboMap();
  const combos = [];
  for (const [key, combo] of comboMap) {
    if (combo.cardAId === id || combo.cardBId === id) {
      const partner = combo.cardAId === id ? combo.cardB : combo.cardA;
      combos.push({
        id: combo.id,
        partner,
        resultName: combo.resultName,
        resultRarity: combo.resultRarity,
        ba0: combo.ba0, ba1: combo.ba1, ba2: combo.ba2,
        bd0: combo.bd0, bd1: combo.bd1, bd2: combo.bd2,
      });
    }
  }
  combos.sort((a, b) => a.partner.name.localeCompare(b.partner.name));
  return { card, combos };
}

// ===== Combinations =====
export interface ComboQuery {
  a?: string;
  b?: string;
  result?: string;
  rarity?: string;
  limit?: number;
}

export async function fetchCombinations(query: ComboQuery = {}) {
  const cards = await store.getCards();
  await store.getCombos();
  const comboMap = store.getComboMap();
  let results: Combination[] = [];

  if (query.a && query.b) {
    const cardA = cards.find((c) => c.name === query.a);
    const cardB = cards.find((c) => c.name === query.b);
    if (cardA && cardB) {
      const [lo, hi] = cardA.id < cardB.id ? [cardA.id, cardB.id] : [cardB.id, cardA.id];
      const combo = comboMap.get(`${lo}_${hi}`);
      if (combo) results = [combo];
    }
  } else {
    const allCombos = await store.getCombos();
    results = allCombos.filter((c) => {
      if (query.result && !c.resultName.toLowerCase().includes(query.result.toLowerCase())) return false;
      if (query.rarity && query.rarity !== 'all' && c.resultRarity !== parseInt(query.rarity)) return false;
      if (query.a) {
        const aLower = query.a.toLowerCase();
        if (!c.cardA.name.toLowerCase().includes(aLower) && !c.cardB.name.toLowerCase().includes(aLower)) return false;
      }
      return true;
    });
  }
  const total = results.length;
  const limit = query.limit ?? 200;
  return { combos: results.slice(0, limit), total };
}

// ===== Library =====
function requireUserId(): string {
  const uid = store.getStoredUserId();
  if (!uid) throw new Error('No active session');
  return uid;
}

export async function fetchLibrary() {
  await store.getCards();
  const uid = requireUserId();
  const library = store.getLibrarySync(uid);
  return { library };
}

export async function addToLibrary(input: {
  cardId: number;
  level?: number;
  quantity?: number;
  fused1?: boolean;
  fused2?: boolean;
  fused3?: boolean;
}) {
  await store.getCards();
  const uid = requireUserId();
  const item = await store.addToLibrary(
    uid,
    input.cardId,
    input.level ?? 5,
    input.quantity ?? 1,
    input.fused1 ?? false,
    input.fused2 ?? false,
    input.fused3 ?? false
  );
  // Fill card data
  item.card = store.getCardById(input.cardId)!;
  return { libraryItem: item };
}

export async function updateLibraryItem(
  id: string,
  input: Partial<Pick<LibraryItem, 'level' | 'quantity' | 'fused1' | 'fused2' | 'fused3'>>
) {
  const uid = requireUserId();
  const item = store.updateLibraryItem(uid, id, input);
  if (!item) throw new Error('Not found');
  item.card = store.getCardById(item.cardId)!;
  return { libraryItem: item };
}

export async function removeFromLibrary(id: string) {
  const uid = requireUserId();
  store.removeFromLibrary(uid, id);
  return { deleted: true };
}

// ===== Decks (management) =====
export async function fetchDecks() {
  const uid = requireUserId();
  return { decks: store.getDecksSync(uid) };
}
export async function createDeck(name?: string) {
  const uid = requireUserId();
  return { deck: store.createDeck(uid, name) };
}
export async function renameDeck(id: string, name: string) {
  const uid = requireUserId();
  const deck = store.renameDeck(uid, id, name);
  if (!deck) throw new Error('Not found');
  return { deck };
}
export async function deleteDeck(id: string) {
  const uid = requireUserId();
  store.deleteDeck(uid, id);
  return { deleted: true };
}
export async function activateDeck(id: string) {
  const uid = requireUserId();
  store.activateDeck(uid, id);
  return { ok: true };
}
export async function clearDeck(id: string) {
  const uid = requireUserId();
  store.clearDeck(uid, id);
  return { ok: true };
}

// ===== Active deck (items) =====
export async function fetchActiveDeck() {
  await store.getCards();
  const uid = requireUserId();
  return store.getActiveDeckSync(uid);
}

export async function addToDeck(input: {
  cardId: number;
  level?: number;
  quantity?: number;
  fused1?: boolean;
  fused2?: boolean;
  fused3?: boolean;
}) {
  await store.getCards();
  const uid = requireUserId();
  const item = store.addToDeck(
    uid,
    input.cardId,
    input.level ?? 5,
    input.quantity ?? 1,
    input.fused1 ?? false,
    input.fused2 ?? false,
    input.fused3 ?? false
  );
  item.card = store.getCardById(input.cardId)!;
  return { deckItem: item };
}

export async function updateDeckItem(
  id: string,
  input: Partial<Pick<DeckItem, 'level' | 'quantity' | 'fused1' | 'fused2' | 'fused3'>>
) {
  const uid = requireUserId();
  const item = store.updateDeckItem(uid, id, input);
  if (!item) throw new Error('Not found');
  item.card = store.getCardById(item.cardId)!;
  return { deckItem: item };
}

export async function removeFromDeck(id: string) {
  const uid = requireUserId();
  store.removeFromDeck(uid, id);
  return { deleted: true };
}

export async function clearActiveDeck() {
  const uid = requireUserId();
  store.clearActiveDeck(uid);
  return { ok: true };
}

// ===== Optimizer =====
// The scoring formula (verified 671/671 against the Excel):
//   fused_scalar = (aOnyx?1:0) + (bOnyx?1:0) + 1  → selects overcharge level
//   score = BA[fused_scalar-1] × mode_attack + BD[fused_scalar-1] × mode_defence
//         + (level_avg + rarity_adj) × rarity_value × mode_bonus

// Mode multipliers (same as optimizer.ts)
const M_ATTACK: Record<OptimizeMode, number> = { sum: 1, attack: 1, defence: 0, heroics: 1.5 };
const M_DEFENCE: Record<OptimizeMode, number> = { sum: 1, attack: 0, defence: 1, heroics: 0.5 };
const M_BONUS: Record<OptimizeMode, number> = { sum: 2, attack: 1, defence: 1, heroics: 2 };

function excelRound(x: number): number { return Math.floor(x + 0.5); }

function pairScore(
  combo: Combination, aOnyx: boolean, bOnyx: boolean, aLevel: number, bLevel: number,
  mode: OptimizeMode, fusionBuff: number
): number {
  const fs = (aOnyx ? 1 : 0) + (bOnyx ? 1 : 0) + 1;
  const ba = [combo.ba0, combo.ba1, combo.ba2][fs - 1];
  const bd = [combo.bd0, combo.bd1, combo.bd2][fs - 1];
  const either = aOnyx || bOnyx;
  const lvAvg = excelRound((aLevel + bLevel) / 2);
  const rAdj = either ? 0 : combo.resultRarity <= 2 ? -1 : 0;
  const rVal = either ? 4 : combo.comboRarity;
  const battlePart = (ba * M_ATTACK[mode] + bd * M_DEFENCE[mode]) * fusionBuff;
  const rarityPart = (lvAvg + rAdj) * rVal * M_BONUS[mode];
  return battlePart + rarityPart;
}

export async function fetchOptimize(
  mode: OptimizeMode,
  params: ScoringParams = DEFAULT_SCORING_PARAMS
): Promise<OptimizeResult> {
  await store.getCards();
  await store.getCombos();
  setBaseIdResolver(store.getBaseCardId);
  const uid = requireUserId();
  const { deck } = store.getActiveDeckSync(uid);
  if (!deck || deck.items.length === 0) {
    return { mode, score: 0, deckSize: 0, breakdown: { comboCount: 0, fusedCount: 0, rarityCounts: {} }, pairs: [], suggestions: [] };
  }

  const deckInstances = deck.items.flatMap((it) => expandItemWithMeta(it));
  const comboMap = store.getComboMap();
  const library = store.getLibrarySync(uid);

  // Build library items with quantities for the scoring function
  const libraryItems = library.map((lib) => ({
    instance: expandItemWithMeta(lib)[0], // first copy's stats
    quantity: lib.quantity,
  }));

  // Calculate Fusion Buff from the deck
  const fusionBuff = params.fusionBuffOverride ?? calculateFusionBuff(deckInstances);

  // Compute copy scores for all library cards
  const allCopyScores: Array<{ name: string; cardId: number; scores: number[]; fused: boolean }> = [];
  for (const lib of library) {
    const libInstance = expandItemWithMeta(lib)[0];
    const scores = scoreLibraryCard(libInstance, deckInstances, comboMap, mode, params, fusionBuff, lib.quantity);
    allCopyScores.push({ name: lib.card.name, cardId: lib.cardId, scores, fused: lib.fused1 });
  }

  // Flatten and sort all copy scores descending
  const flatScores: Array<{ name: string; cardId: number; score: number; copyIdx: number }> = [];
  for (const { name, cardId, scores } of allCopyScores) {
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] > 0) {
        flatScores.push({ name, cardId, score: scores[i], copyIdx: i });
      }
    }
  }
  flatScores.sort((a, b) => b.score - a.score);

  // Total score = sum of top 30 copy scores (matching deck size)
  const topScores = flatScores.slice(0, DECK_MAX_SIZE);
  const score = topScores.reduce((sum, s) => sum + s.score, 0);

  // Build pairs display (top contributing library cards)
  const pairs = topScores.map((s) => ({
    a: s.name + (s.copyIdx > 0 ? ` #${s.copyIdx + 1}` : ''),
    b: '(deck)',
    result: 'contribution',
    resultRarity: 0,
    ba: 0, bd: 0,
    contribution: s.score,
  }));

  const rarityCounts: Record<string, number> = {};
  for (const it of deck.items) { rarityCounts[it.card.rarity] = (rarityCounts[it.card.rarity] ?? 0) + it.quantity; }

  let fusedCount = 0;
  for (const it of deck.items) { if (it.fused1 || it.fused2 || it.fused3) fusedCount++; }

  // Suggestions: library cards NOT in the deck, ranked by their copy score
  const deckCardIds = new Set(deck.items.map((it) => it.cardId));
  const suggestions: Array<{ cardId: number; name: string; rarity: string; level: number; fused: boolean; gain: number }> = [];
  for (const lib of library) {
    if (deckCardIds.has(lib.cardId)) continue;
    const libInstance = expandItemWithMeta(lib)[0];
    const scores = scoreLibraryCard(libInstance, deckInstances, comboMap, mode, params, fusionBuff, 1);
    if (scores[0] > 0) {
      suggestions.push({ cardId: lib.cardId, name: lib.card.name, rarity: lib.card.rarity, level: lib.level, fused: lib.fused1, gain: scores[0] });
    }
  }
  suggestions.sort((a, b) => b.gain - a.gain);

  return {
    mode, score, deckSize: deckInstances.length,
    breakdown: { comboCount: topScores.length, fusedCount, rarityCounts },
    pairs: pairs.slice(0, 50),
    suggestions: suggestions.slice(0, 30),
  };
}

export async function autoFill(input: {
  algorithm: 'quick' | 'advanced' | 'try-all';
  mode: OptimizeMode;
  keepCurrent?: boolean;
  params?: ScoringParams;
}): Promise<AutoFillResult> {
  await store.getCards();
  await store.getCombos();
  const uid = requireUserId();
  const { deck } = store.getActiveDeckSync(uid);
  if (!deck) throw new Error('No active deck');

  const library = store.getLibrarySync(uid);
  if (library.length === 0) throw new Error('Your library is empty');

  // Build candidates from library — preserve level, fused, and onyx status
  const candidates: Candidate[] = [];
  for (const lib of library) {
    const insts = expandItemWithMeta(lib);
    for (const inst of insts) {
      candidates.push({ cardId: inst.cardId, fused: inst.fused, level: inst.level, onyx: inst.onyx });
    }
  }

  const start: CardInstance[] = input.keepCurrent ? deck.items.flatMap((it) => expandItemWithMeta(it)) : [];
  let pool = [...candidates];
  if (input.keepCurrent) {
    for (const kept of start) {
      const idx = pool.findIndex((c) => c.cardId === kept.cardId && c.fused === kept.fused && c.level === kept.level && c.onyx === kept.onyx);
      if (idx >= 0) pool.splice(idx, 1);
    }
  }

  const comboMap = store.getComboMap();
  const params = input.params ?? DEFAULT_SCORING_PARAMS;
  // Build library items with quantities for scoring
  const libraryItems = library.map((lib) => ({
    instance: expandItemWithMeta(lib)[0],
    quantity: lib.quantity,
  }));
  let result;
  if (input.algorithm === 'quick') result = quickFill(start, pool, comboMap, input.mode, DECK_MAX_SIZE, params, libraryItems);
  else if (input.algorithm === 'advanced') result = advancedFill(start, pool, comboMap, input.mode, DECK_MAX_SIZE, 6, params, libraryItems);
  else result = tryAllFill(pool, comboMap, input.mode, DECK_MAX_SIZE, params, libraryItems);

  const collapsed = collapseInstances(result.instances);
  collapsed.sort((a, b) => a.cardId - b.cardId);

  // Replace deck items — preserve level and onyx from the collapsed instances
  const allItems = store.getAllDeckItemsSync(uid).filter((i) => i.deckId !== deck.id);
  collapsed.forEach((c, i) => {
    allItems.push({
      id: 'di_' + Date.now().toString(36) + '_' + i,
      deckId: deck.id,
      cardId: c.cardId,
      card: store.getCardById(c.cardId)!,
      level: c.level,
      quantity: c.quantity,
      fused1: c.fused1,
      fused2: c.fused2,
      fused3: c.fused3,
      position: i,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });
  const stripped = allItems.map(({ card, ...rest }) => rest);
  localStorage.setItem(`la_deck_items_${uid}`, JSON.stringify(stripped));

  const newItems = store.getAllDeckItemsSync(uid).filter((i) => i.deckId === deck.id).sort((a, b) => a.position - b.position);
  return {
    algorithm: input.algorithm,
    mode: input.mode,
    score: result.score,
    iterations: result.iterations,
    durationMs: result.durationMs,
    deck: newItems,
    deckSize: result.instances.length,
  };
}

// ===== Stats =====
export async function fetchStats(): Promise<Stats> {
  await store.getCards();
  const cards = await store.getCards();
  const totalCards = cards.length;
  await store.getCombos();
  const totalCombos = (await store.getCombos()).length;

  const rarityCounts: Record<string, number> = {};
  for (const c of cards) rarityCounts[c.rarity] = (rarityCounts[c.rarity] ?? 0) + 1;

  const topCards = [...cards].sort((a, b) => b.comboCount - a.comboCount).slice(0, 5);
  const comboMap = store.getComboMap();
  const resultMap = new Map<string, number>();
  for (const combo of comboMap.values()) {
    resultMap.set(combo.resultName, (resultMap.get(combo.resultName) ?? 0) + 1);
  }
  const topResults = [...resultMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));

  const uid = store.getStoredUserId();
  let libraryCount = 0;
  let deckCount = 0;
  let deckCountUnique = 0;
  if (uid) {
    const lib = store.getLibrarySync(uid);
    libraryCount = lib.reduce((s, l) => s + l.quantity, 0);
    const { deck } = store.getActiveDeckSync(uid);
    if (deck) {
      deckCount = deck.items.reduce((s, it) => s + it.quantity, 0);
      deckCountUnique = deck.items.length;
    }
  }

  return {
    totalCards,
    totalCombos,
    libraryCount,
    deckCount,
    deckCountUnique,
    isLoggedIn: !!uid,
    rarityCounts,
    topCards: topCards.map((c) => ({ id: c.id, name: c.name, rarity: c.rarity, comboCount: c.comboCount, imageUrl: c.imageUrl })),
    topResults,
  };
}
