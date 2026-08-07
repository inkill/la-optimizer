// Deck scoring + auto-fill algorithms for the Little Alchemist optimizer.
//
// Scoring formula (reverse-engineered from the Excel spreadsheet, verified
// 671/671 matches):
//
//   fused_scalar = (deck_onyx ? 1 : 0) + (lib_onyx ? 1 : 0) + 1
//   → selects overcharge level: 1→BA_0O/BD_0O, 2→BA_1O/BD_1O, 3→BA_2O/BD_2O
//
//   score = BA[fused_scalar-1] * mode_attack_mult
//         + BD[fused_scalar-1] * mode_defence_mult
//         + (level_avg + rarity_adj) * rarity_value * mode_bonus_mult
//
// Where:
//   - Onyx = card name contains ":"
//   - mode_attack_mult: Sum=1, Attack=1, Defence=0, Heroics=1.5
//   - mode_defence_mult: Sum=1, Attack=0, Defence=1, Heroics=0.5
//   - level_avg = round_half_up((deck_level + lib_level) / 2)
//   - rarity_adj: if either Onyx → 0; else Common/Uncommon=-1, Rare/Onyx=0
//   - rarity_value: if either Onyx → 4; else Cmb_Rare
//   - mode_bonus_mult: Sum=2, Attack=1, Defence=1, Heroics=2
//
// For deck scoring, each pair's contribution is reduced by 0.93^dupCount
// for duplicate results.

import type { Combination } from '@/lib/types';

export type OptimizeMode = 'sum' | 'attack' | 'defence' | 'heroics';
export type AutoFillAlgorithm = 'quick' | 'advanced' | 'try-all';

export const DECK_MAX_SIZE = 30;
export const MAX_COPIES_PER_CARD = 3;

// A single card instance in the deck (one copy of a card, fused or not).
export interface CardInstance {
  cardId: number;
  fused: boolean;
  level: number;
  onyx: boolean; // whether the card name contains ":" (Onyx variant)
}

// A candidate card instance that can be added to the deck.
export type Candidate = CardInstance;

// Result of a fill run.
export interface FillResult {
  instances: CardInstance[];
  score: number;
  iterations: number;
  durationMs: number;
}

// Optional resolver function: maps Onyx cardId → base cardId.
// Set by the caller (from client-store) so Onyx cards find combinations via
// their base card. If not set, uses the cardId as-is.
let _baseIdResolver: ((cardId: number) => number) | null = null;

export function setBaseIdResolver(fn: (cardId: number) => number) {
  _baseIdResolver = fn;
}

function resolveBaseId(cardId: number): number {
  return _baseIdResolver ? _baseIdResolver(cardId) : cardId;
}

// Look up a combination by two card IDs, resolving Onyx → base IDs first.
function lookupCombo(
  comboMap: Map<string, Combination>,
  aId: number,
  bId: number
): Combination | undefined {
  const aBase = resolveBaseId(aId);
  const bBase = resolveBaseId(bId);
  const [lo, hi] = aBase < bBase ? [aBase, bBase] : [bBase, aBase];
  return comboMap.get(`${lo}_${hi}`);
}

// Build a combo lookup keyed by sorted card-id pair: `${lo}_${hi}` -> combo.
export function buildComboMap(combos: Combination[]): Map<string, Combination> {
  const map = new Map<string, Combination>();
  for (const c of combos) {
    const [lo, hi] = c.cardAId < c.cardBId ? [c.cardAId, c.cardBId] : [c.cardBId, c.cardAId];
    map.set(`${lo}_${hi}`, c);
  }
  return map;
}

// Excel-style rounding: round half up (not banker's rounding).
function excelRound(x: number): number {
  return Math.floor(x + 0.5);
}

// Mode multipliers
const MODE_ATTACK: Record<OptimizeMode, number> = { sum: 1, attack: 1, defence: 0, heroics: 1.5 };
const MODE_DEFENCE: Record<OptimizeMode, number> = { sum: 1, attack: 0, defence: 1, heroics: 0.5 };
const MODE_BONUS: Record<OptimizeMode, number> = { sum: 2, attack: 1, defence: 1, heroics: 2 };

// Compute the pair score for two card instances.
function pairScore(
  combo: Combination,
  aOnyx: boolean,
  bOnyx: boolean,
  aLevel: number,
  bLevel: number,
  mode: OptimizeMode
): number {
  const fusedScalar = (aOnyx ? 1 : 0) + (bOnyx ? 1 : 0) + 1; // 1, 2, or 3
  const ba = [combo.ba0, combo.ba1, combo.ba2][fusedScalar - 1];
  const bd = [combo.bd0, combo.bd1, combo.bd2][fusedScalar - 1];

  const eitherOnyx = aOnyx || bOnyx;
  const levelAvg = excelRound((aLevel + bLevel) / 2);
  const rarityAdj = eitherOnyx ? 0 : combo.resultRarity <= 2 ? -1 : 0;
  const rarityValue = eitherOnyx ? 4 : combo.comboRarity;

  return (
    ba * MODE_ATTACK[mode] +
    bd * MODE_DEFENCE[mode] +
    (levelAvg + rarityAdj) * rarityValue * MODE_BONUS[mode]
  );
}

// Score a full deck (list of instances), applying copy-reduction for duplicate results.
export function scoreDeck(
  instances: CardInstance[],
  comboMap: Map<string, Combination>,
  mode: OptimizeMode
): number {
  let score = 0;
  const resultCount = new Map<string, number>();
  for (let i = 0; i < instances.length; i++) {
    for (let j = i + 1; j < instances.length; j++) {
      const a = instances[i];
      const b = instances[j];
      const combo = lookupCombo(comboMap, a.cardId, b.cardId);
      if (!combo) continue;
      const raw = pairScore(combo, a.onyx, b.onyx, a.level, b.level, mode);
      const dupIndex = resultCount.get(combo.resultName) ?? 0;
      const reduction = Math.pow(0.93, dupIndex);
      score += Math.round(raw * reduction);
      resultCount.set(combo.resultName, dupIndex + 1);
    }
  }
  return score;
}

// Marginal gain of adding `candidate` to `instances`.
function marginalGain(
  candidate: CardInstance,
  instances: CardInstance[],
  comboMap: Map<string, Combination>,
  mode: OptimizeMode
): number {
  let gain = 0;
  for (let i = 0; i < instances.length; i++) {
    const d = instances[i];
    const combo = lookupCombo(comboMap, candidate.cardId, d.cardId);
    if (!combo) continue;
    gain += pairScore(combo, candidate.onyx, d.onyx, candidate.level, d.level, mode);
  }
  return gain;
}

function countCopies(cardId: number, instances: CardInstance[]): number {
  let n = 0;
  for (const inst of instances) if (inst.cardId === cardId) n++;
  return n;
}

// Greedy quick-fill.
export function quickFill(
  start: CardInstance[],
  candidates: Candidate[],
  comboMap: Map<string, Combination>,
  mode: OptimizeMode,
  maxSize: number = DECK_MAX_SIZE
): FillResult {
  const t0 = Date.now();
  const instances = [...start];
  const pool = [...candidates];
  let iterations = 0;

  while (instances.length < maxSize && pool.length > 0) {
    let bestIdx = -1;
    let bestGain = -1;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      if (countCopies(c.cardId, instances) >= MAX_COPIES_PER_CARD) continue;
      const gain = marginalGain(c, instances, comboMap, mode);
      iterations++;
      if (gain > bestGain) {
        bestGain = gain;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;
    instances.push({ cardId: pool[bestIdx].cardId, fused: pool[bestIdx].fused, level: pool[bestIdx].level, onyx: pool[bestIdx].onyx });
    pool.splice(bestIdx, 1);
  }

  return {
    instances,
    score: scoreDeck(instances, comboMap, mode),
    iterations,
    durationMs: Date.now() - t0,
  };
}

// Beam search advanced fill.
export function advancedFill(
  start: CardInstance[],
  candidates: Candidate[],
  comboMap: Map<string, Combination>,
  mode: OptimizeMode,
  maxSize: number = DECK_MAX_SIZE,
  beamWidth: number = 6
): FillResult {
  const t0 = Date.now();
  type Beam = { instances: CardInstance[]; score: number };
  const initialScore = scoreDeck(start, comboMap, mode);
  const beams: Beam[] = [{ instances: [...start], score: initialScore }];
  let iterations = 0;

  while (beams[0].instances.length < maxSize) {
    const expanded: Beam[] = [];
    for (const beam of beams) {
      const usedCardIds = new Set<number>();
      const copies = new Map<number, number>();
      for (const inst of beam.instances) {
        copies.set(inst.cardId, (copies.get(inst.cardId) ?? 0) + 1);
      }
      for (const c of candidates) {
        const cnt = copies.get(c.cardId) ?? 0;
        if (cnt >= MAX_COPIES_PER_CARD) continue;
        if (usedCardIds.has(c.cardId)) continue;
        const gain = marginalGain(c, beam.instances, comboMap, mode);
        iterations++;
        if (gain <= 0 && beam.instances.length > 0) continue;
        const newInstances = [...beam.instances, { cardId: c.cardId, fused: c.fused, level: c.level, onyx: c.onyx }];
        expanded.push({ instances: newInstances, score: beam.score + gain });
        usedCardIds.add(c.cardId);
      }
    }
    if (expanded.length === 0) break;
    expanded.sort((a, b) => b.score - a.score);
    beams.length = 0;
    beams.push(...expanded.slice(0, beamWidth));
  }

  const best = beams[0];
  return {
    instances: best.instances,
    score: scoreDeck(best.instances, comboMap, mode),
    iterations,
    durationMs: Date.now() - t0,
  };
}

// Try-all: for each candidate as the sole seed, quick-fill the rest.
export function tryAllFill(
  candidates: Candidate[],
  comboMap: Map<string, Combination>,
  mode: OptimizeMode,
  maxSize: number = DECK_MAX_SIZE
): FillResult {
  const t0 = Date.now();
  let best: FillResult | null = null;
  let iterations = 0;

  for (let s = 0; s < candidates.length; s++) {
    const seed = candidates[s];
    const rest = candidates.filter((_, i) => i !== s);
    const result = quickFill([seed], rest, comboMap, mode, maxSize);
    iterations += result.iterations;
    if (!best || result.score > best.score) {
      best = result;
    }
  }

  if (!best) {
    return { instances: [], score: 0, iterations: 0, durationMs: Date.now() - t0 };
  }
  return { ...best, iterations, durationMs: Date.now() - t0 };
}

// Expand a library/deck item into CardInstances, preserving fused state.
export function expandItem(item: {
  cardId: number;
  quantity: number;
  fused1: boolean;
  fused2: boolean;
  fused3: boolean;
  level: number;
  onyx: boolean;
}): CardInstance[] {
  const out: CardInstance[] = [];
  if (item.quantity >= 1) out.push({ cardId: item.cardId, fused: item.fused1, level: item.level, onyx: item.onyx });
  if (item.quantity >= 2) out.push({ cardId: item.cardId, fused: item.fused2, level: item.level, onyx: item.onyx });
  if (item.quantity >= 3) out.push({ cardId: item.cardId, fused: item.fused3, level: item.level, onyx: item.onyx });
  return out;
}

// Collapse instances back into stored-item shape.
export function collapseInstances(instances: CardInstance[]): Array<{
  cardId: number;
  quantity: number;
  fused1: boolean;
  fused2: boolean;
  fused3: boolean;
  level: number;
  onyx: boolean;
}> {
  const byCard = new Map<number, CardInstance[]>();
  for (const inst of instances) {
    const arr = byCard.get(inst.cardId) ?? [];
    arr.push(inst);
    byCard.set(inst.cardId, arr);
  }
  const out: Array<{
    cardId: number; quantity: number;
    fused1: boolean; fused2: boolean; fused3: boolean;
    level: number; onyx: boolean;
  }> = [];
  for (const [cardId, arr] of byCard) {
    out.push({
      cardId,
      quantity: arr.length,
      fused1: arr[0]?.fused ?? false,
      fused2: arr[1]?.fused ?? false,
      fused3: arr[2]?.fused ?? false,
      level: arr[0]?.level ?? 5,
      onyx: arr[0]?.onyx ?? false,
    });
  }
  return out;
}
