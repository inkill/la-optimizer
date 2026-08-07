// Client-side data store for the Little Alchemist app.
// Replaces the server-side Prisma/SQLite backend for static hosting
// (GitHub Pages). All user data is stored in the browser's localStorage.
//
// Static catalog data (cards, combinations) is loaded once from /data/*.json
// and cached in memory.

import type { Card, Combination, LibraryItem, DeckItem, Deck, User } from './types';
import { DECK_MAX_SIZE, MAX_COPIES_PER_CARD } from './types';

// ===== Static catalog (loaded once) =====
let _cards: Card[] | null = null;
let _combos: Combination[] | null = null;
let _comboMap: Map<string, Combination> | null = null;
let _cardById: Map<number, Card> | null = null;
let _cardByName: Map<string, Card> | null = null;
// Onyx cards (e.g. "Speed:Onyx") have their own IDs but use the BASE card's
// combinations. This map resolves Onyx cardId → base cardId for combo lookups.
let _onyxToBaseId: Map<number, number> | null = null;

// basePath prefix: set by the build for GitHub Pages (e.g. "/la-optimizer").
// Falls back to "" for local dev / root deployment.
function basePath(): string {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BASE_PATH) {
    return process.env.NEXT_PUBLIC_BASE_PATH;
  }
  return '';
}

async function loadCards(): Promise<Card[]> {
  if (_cards) return _cards;
  const res = await fetch(`${basePath()}/data/cards.json`);
  _cards = (await res.json()) as Card[];
  _cardById = new Map(_cards.map((c) => [c.id, c]));
  _cardByName = new Map(_cards.map((c) => [c.name, c]));
  // Build Onyx → base card ID map. Onyx cards have ":" in the name (e.g.
  // "Speed:Onyx"); their base card is the one without the suffix ("Speed").
  _onyxToBaseId = new Map();
  for (const c of _cards) {
    if (c.name.includes(':')) {
      const baseName = c.name.split(':')[0];
      const baseCard = _cardByName.get(baseName);
      if (baseCard) {
        _onyxToBaseId.set(c.id, baseCard.id);
      }
    }
  }
  return _cards;
}

async function loadCombos(): Promise<Combination[]> {
  if (_combos) return _combos;
  const res = await fetch(`${basePath()}/data/combinations.json`);
  const raw = (await res.json()) as Array<{
    a: number; b: number; r: string; rr: number; cr: number;
    ba0: number; ba1: number; ba2: number;
    bd0: number; bd1: number; bd2: number;
  }>;
  _combos = raw.map((c, i) => ({
    id: i,
    comboNum: 0,
    comboId: 0,
    cardAId: c.a,
    cardBId: c.b,
    cardA: _cardById!.get(c.a)!,
    cardB: _cardById!.get(c.b)!,
    resultName: c.r,
    resultRarity: c.rr,
    comboRarity: c.cr,
    ba0: c.ba0, ba1: c.ba1, ba2: c.ba2,
    bd0: c.bd0, bd1: c.bd1, bd2: c.bd2,
  }));
  // Build lookup map: sorted pair key -> combo
  _comboMap = new Map();
  for (const c of _combos) {
    const [lo, hi] = c.cardAId < c.cardBId ? [c.cardAId, c.cardBId] : [c.cardBId, c.cardAId];
    _comboMap.set(`${lo}_${hi}`, c);
  }
  return _combos;
}

export async function getCards(): Promise<Card[]> {
  return loadCards();
}
export async function getCombos(): Promise<Combination[]> {
  await loadCards();
  return loadCombos();
}
export function getComboMap(): Map<string, Combination> {
  return _comboMap!;
}
export function getCardById(id: number): Card | undefined {
  return _cardById?.get(id);
}
export function getCardByName(name: string): Card | undefined {
  return _cardByName?.get(name);
}
// Resolve an Onyx card ID to its base card ID. Onyx cards (e.g. "Speed:Onyx")
// use the same combinations as their base card ("Speed"), but with Onyx
// scoring modifiers. Returns the original ID if not an Onyx card.
export function getBaseCardId(cardId: number): number {
  return _onyxToBaseId?.get(cardId) ?? cardId;
}

// ===== localStorage helpers =====
const LS_PREFIX = 'la_';
const USERS_KEY = `${LS_PREFIX}users`;
const ACTIVE_USER_KEY = `${LS_PREFIX}active_user`;

function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function lsSet<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('localStorage write failed', e);
  }
}
function lsRemove(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(key);
}

// ===== Users =====
export function getAllUsers(): User[] {
  return lsGet<User[]>(USERS_KEY, []);
}
function saveAllUsers(users: User[]): void {
  lsSet(USERS_KEY, users);
}

export function getStoredUserId(): string | null {
  return lsGet<string | null>(ACTIVE_USER_KEY, null);
}
export function setStoredUserId(id: string): void {
  lsSet(ACTIVE_USER_KEY, id);
}
export function clearStoredUserId(): void {
  lsRemove(ACTIVE_USER_KEY);
}

export function getCurrentUserSync(): User | null {
  const id = getStoredUserId();
  if (!id) return null;
  return getAllUsers().find((u) => u.id === id) ?? null;
}

// Generate a unique ID (cuid-like).
function genId(): string {
  return 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ===== Default library seed =====
// Mirrors the spreadsheet's default USER library (rows 12+). Every starter
// card is level 5 and fused — including Bronze/Silver cards.
// Cards: all Bronze (Common) + all Silver (Uncommon) + 10 specific Gold (Rare)
// cards. The 10 Gold starter cards are listed below.
const DEFAULT_GOLD_STARTERS = [
  'Bear', 'Science', 'Time', 'Energy', 'Wind', 'Villain',
  'Food', 'Life', 'Space', 'Monster',
];

async function seedDefaultLibrary(userId: string): Promise<void> {
  const cards = await loadCards();
  // All Bronze + Silver cards, fused.
  const bronzeSilver = cards.filter(
    (c) => c.rarity === 'Bronze' || c.rarity === 'Silver'
  );
  // 10 specific Gold cards, fused.
  const goldStarters = cards.filter(
    (c) => c.rarity === 'Gold' && DEFAULT_GOLD_STARTERS.includes(c.name)
  );

  const items: LibraryItem[] = [];
  for (const c of bronzeSilver) {
    items.push(makeLibraryItem(userId, c.id, 5, 1, true, false, false));
  }
  for (const c of goldStarters) {
    items.push(makeLibraryItem(userId, c.id, 5, 1, true, false, false));
  }
  saveLibrary(userId, items);
}

function makeLibraryItem(
  userId: string, cardId: number, level: number, quantity: number,
  fused1: boolean, fused2: boolean, fused3: boolean
): LibraryItem {
  return {
    id: 'l_' + genId(),
    cardId,
    card: null as unknown as Card, // filled by caller
    level,
    quantity,
    fused1, fused2, fused3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ===== Guest / Register =====
export async function createGuestUser(): Promise<User> {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  const name = `Guest-${suffix}`;
  const user: User = { id: genId(), name, createdAt: new Date().toISOString() };
  const users = getAllUsers();
  users.push(user);
  saveAllUsers(users);
  setStoredUserId(user.id);
  await seedDefaultLibrary(user.id);
  // Create a default deck
  saveDecks(user.id, [{ id: 'd_' + genId(), name: 'Deck 1', userId: user.id, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
  return user;
}

export function registerUser(name: string): { user: User; renamed: boolean; switched: boolean } {
  const currentId = getStoredUserId();
  if (!currentId) throw new Error('No active session');
  const trimmed = name.trim().slice(0, 40);
  const users = getAllUsers();
  // Check if a named account already exists
  const existing = users.find((u) => u.name === trimmed);
  if (existing) {
    setStoredUserId(existing.id);
    return { user: existing, switched: true };
  }
  // Rename the current user
  const idx = users.findIndex((u) => u.id === currentId);
  if (idx < 0) throw new Error('Current user not found');
  users[idx].name = trimmed;
  saveAllUsers(users);
  return { user: users[idx], renamed: true };
}

export function logoutUser(): void {
  clearStoredUserId();
}

// ===== Library (per user) =====
function libraryKey(userId: string): string {
  return `${LS_PREFIX}library_${userId}`;
}

export function getLibrarySync(userId: string): LibraryItem[] {
  const items = lsGet<LibraryItem[]>(libraryKey(userId), []);
  // Fill in card data from cache
  for (const item of items) {
    if (!item.card || !item.card.name) {
      item.card = _cardById?.get(item.cardId) ?? ({} as Card);
    }
  }
  return items;
}
function saveLibrary(userId: string, items: LibraryItem[]): void {
  // Strip card data before saving (it's redundant — we re-fill on load)
  const stripped = items.map(({ card, ...rest }) => rest);
  lsSet(libraryKey(userId), stripped);
}

export async function addToLibrary(
  userId: string, cardId: number, level: number, quantity: number,
  fused1: boolean, fused2: boolean, fused3: boolean
): Promise<LibraryItem> {
  const items = getLibrarySync(userId);
  const existing = items.find((i) => i.cardId === cardId);
  if (existing) {
    existing.level = level;
    existing.quantity = Math.min(Math.max(existing.quantity, quantity), 3);
    existing.fused1 = existing.fused1 || fused1;
    existing.fused2 = existing.fused2 || fused2;
    existing.fused3 = existing.fused3 || fused3;
    existing.updatedAt = new Date().toISOString();
    saveLibrary(userId, items);
    return existing;
  }
  const item = makeLibraryItem(userId, cardId, level, quantity, fused1, fused2, fused3);
  items.push(item);
  saveLibrary(userId, items);
  return item;
}

export function updateLibraryItem(
  userId: string, itemId: string,
  input: Partial<Pick<LibraryItem, 'level' | 'quantity' | 'fused1' | 'fused2' | 'fused3'>>
): LibraryItem | null {
  const items = getLibrarySync(userId);
  const idx = items.findIndex((i) => i.id === itemId);
  if (idx < 0) return null;
  if (input.level != null) items[idx].level = Math.min(Math.max(input.level, 1), 5);
  if (input.quantity != null) items[idx].quantity = Math.min(Math.max(input.quantity, 1), 3);
  if (input.fused1 != null) items[idx].fused1 = input.fused1;
  if (input.fused2 != null) items[idx].fused2 = input.fused2;
  if (input.fused3 != null) items[idx].fused3 = input.fused3;
  items[idx].updatedAt = new Date().toISOString();
  saveLibrary(userId, items);
  return items[idx];
}

export function removeFromLibrary(userId: string, itemId: string): void {
  const items = getLibrarySync(userId);
  const filtered = items.filter((i) => i.id !== itemId);
  saveLibrary(userId, filtered);
}

// ===== Decks (per user) =====
function decksKey(userId: string): string {
  return `${LS_PREFIX}decks_${userId}`;
}
function deckItemsKey(userId: string): string {
  return `${LS_PREFIX}deck_items_${userId}`;
}

export function getDecksSync(userId: string): Deck[] {
  const decks = lsGet<Deck[]>(decksKey(userId), []);
  const allItems = lsGet<DeckItem[]>(deckItemsKey(userId), []);
  return decks.map((d) => ({ ...d, size: allItems.filter((i) => i.deckId === d.id).reduce((s, i) => s + i.quantity, 0) }));
}
function saveDecks(userId: string, decks: Deck[]): void {
  const stripped = decks.map(({ size, items, ...rest }) => rest) as Deck[];
  lsSet(decksKey(userId), stripped);
}
export function getAllDeckItemsSync(userId: string): DeckItem[] {
  const items = lsGet<DeckItem[]>(deckItemsKey(userId), []);
  for (const item of items) {
    if (!item.card || !item.card.name) {
      item.card = _cardById?.get(item.cardId) ?? ({} as Card);
    }
  }
  return items;
}
function saveDeckItems(userId: string, items: DeckItem[]): void {
  const stripped = items.map(({ card, ...rest }) => rest);
  lsSet(deckItemsKey(userId), stripped);
}

export function getActiveDeckSync(userId: string): { deck: (Deck & { items: DeckItem[] }) | null; maxSize: number; size: number } {
  const decks = getDecksSync(userId);
  const deck = decks.find((d) => d.isActive) ?? decks[0] ?? null;
  if (!deck) return { deck: null, maxSize: DECK_MAX_SIZE, size: 0 };
  const allItems = getAllDeckItemsSync(userId);
  const items = allItems.filter((i) => i.deckId === deck.id).sort((a, b) => a.position - b.position);
  const size = items.reduce((s, i) => s + i.quantity, 0);
  return { deck: { ...deck, items }, maxSize: DECK_MAX_SIZE, size };
}

export function createDeck(userId: string, name?: string): Deck {
  const decks = getDecksSync(userId);
  if (decks.length >= 10) throw new Error('Maximum 10 decks reached');
  const deck: Deck = {
    id: 'd_' + genId(),
    name: (name?.trim() || `Deck ${decks.length + 1}`).slice(0, 40),
    userId,
    isActive: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  decks.push(deck);
  saveDecks(userId, decks);
  return deck;
}

export function renameDeck(userId: string, deckId: string, name: string): Deck | null {
  const decks = getDecksSync(userId);
  const idx = decks.findIndex((d) => d.id === deckId);
  if (idx < 0) return null;
  decks[idx].name = name.trim().slice(0, 40);
  decks[idx].updatedAt = new Date().toISOString();
  saveDecks(userId, decks);
  return decks[idx];
}

export function deleteDeck(userId: string, deckId: string): void {
  let decks = getDecksSync(userId);
  if (decks.length <= 1) throw new Error('Cannot delete your last deck');
  const wasActive = decks.find((d) => d.id === deckId)?.isActive;
  decks = decks.filter((d) => d.id !== deckId);
  if (wasActive && decks.length > 0) decks[0].isActive = true;
  saveDecks(userId, decks);
  // Remove deck items
  const items = getAllDeckItemsSync(userId).filter((i) => i.deckId !== deckId);
  saveDeckItems(userId, items);
}

export function activateDeck(userId: string, deckId: string): void {
  const decks = getDecksSync(userId);
  for (const d of decks) d.isActive = d.id === deckId;
  saveDecks(userId, decks);
}

export function clearDeck(userId: string, deckId: string): void {
  const items = getAllDeckItemsSync(userId).filter((i) => i.deckId !== deckId);
  saveDeckItems(userId, items);
}

export function clearActiveDeck(userId: string): void {
  const { deck } = getActiveDeckSync(userId);
  if (deck) clearDeck(userId, deck.id);
}

export function addToDeck(
  userId: string, cardId: number, level: number, quantity: number,
  fused1: boolean, fused2: boolean, fused3: boolean
): DeckItem {
  const { deck, size } = getActiveDeckSync(userId);
  if (!deck) throw new Error('No active deck');
  const items = getAllDeckItemsSync(userId);
  const existing = items.find((i) => i.deckId === deck.id && i.cardId === cardId);
  const existingQty = existing?.quantity ?? 0;
  const newQty = Math.min(existingQty + quantity, MAX_COPIES_PER_CARD);
  const actuallyAdded = newQty - existingQty;
  if (newQty === existingQty) throw new Error(`Max ${MAX_COPIES_PER_CARD} copies of a card allowed`);
  if (size + actuallyAdded > DECK_MAX_SIZE) throw new Error(`Deck is full (max ${DECK_MAX_SIZE} cards)`);
  if (existing) {
    const fused = [existing.fused1, existing.fused2, existing.fused3];
    const incoming = [fused1, fused2, fused3];
    let incomingIdx = 0;
    for (let i = existingQty; i < newQty && incomingIdx < incoming.length; i++) fused[i] = incoming[incomingIdx++];
    existing.quantity = newQty;
    existing.fused1 = fused[0];
    existing.fused2 = fused[1];
    existing.fused3 = fused[2];
    existing.updatedAt = new Date().toISOString();
    saveDeckItems(userId, items);
    return existing;
  }
  const maxPos = items.filter((i) => i.deckId === deck.id).reduce((m, i) => Math.max(m, i.position), -1);
  const item: DeckItem = {
    id: 'di_' + genId(),
    deckId: deck.id,
    cardId,
    card: null as unknown as Card,
    level,
    quantity: newQty,
    fused1,
    fused2: newQty >= 2 ? fused2 : false,
    fused3: newQty >= 3 ? fused3 : false,
    position: maxPos + 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  items.push(item);
  saveDeckItems(userId, items);
  return item;
}

export function updateDeckItem(
  userId: string, itemId: string,
  input: Partial<Pick<DeckItem, 'level' | 'quantity' | 'fused1' | 'fused2' | 'fused3'>>
): DeckItem | null {
  const items = getAllDeckItemsSync(userId);
  const idx = items.findIndex((i) => i.id === itemId);
  if (idx < 0) return null;
  if (input.level != null) items[idx].level = Math.min(Math.max(input.level, 1), 5);
  if (input.quantity != null) items[idx].quantity = Math.min(Math.max(input.quantity, 1), 3);
  if (input.fused1 != null) items[idx].fused1 = input.fused1;
  if (input.fused2 != null) items[idx].fused2 = input.fused2;
  if (input.fused3 != null) items[idx].fused3 = input.fused3;
  items[idx].updatedAt = new Date().toISOString();
  saveDeckItems(userId, items);
  return items[idx];
}

export function removeFromDeck(userId: string, itemId: string): void {
  const items = getAllDeckItemsSync(userId).filter((i) => i.id !== itemId);
  saveDeckItems(userId, items);
}
