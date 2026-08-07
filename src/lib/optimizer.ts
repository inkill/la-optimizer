// Deck scoring + auto-fill algorithms for the Little Alchemist optimizer.
//
// The scoring logic is a reimplementation of the spreadsheet's "Sum" mode:
//  - For every pair of card instances in the deck, look up the combination
//    result and its base attack / defence (at 0 overcharge).
//  - Score contribution = (ba0 + bd0) * fusionBuff, where fusionBuff = 1.5 if
//    either card in the pair is fused.
//  - Duplicate results reduce each subsequent contribution by 0.93^dupCount.
//  - attack/heroics mode multiplies attack by 1.5 and defence by 0.5 (and the
//    reverse for defence mode).
//
// Auto-fill algorithms:
//  - quick:    greedy — repeatedly add the candidate with the highest marginal gain
//  - advanced: beam search (width 6) — keep the top-K partial decks at each step
//  - try-all:  for each candidate as the sole seed, quick-fill the rest, keep best

import type { Combination } from '@prisma/client';

export type OptimizeMode = 'sum' | 'attack' | 'defence' | 'heroics';
export type AutoFillAlgorithm = 'quick' | 'advanced' | 'try-all';

export const DECK_MAX_SIZE = 30;
export const MAX_COPIES_PER_CARD = 3;

// A single card instance in the deck (one copy of a card, fused or not).
export interface CardInstance {
  cardId: number;
  fused: boolean;
}

// A candidate card instance that can be added to the deck.
export interface Candidate extends CardInstance {
  level: number;
}

// Result of a fill run.
export interface FillResult {
  instances: CardInstance[];
  score: number;
  iterations: number;
  durationMs: number;
}

// Build a combo lookup keyed by sorted card-id pair: `${lo}_${hi}` -> combo.
// This is the hot path for scoring, so we precompute once per fill session.
export function buildComboMap(combos: Combination[]): Map<string, Combination> {
  const map = new Map<string, Combination>();
  for (const c of combos) {
    const [lo, hi] = c.cardAId < c.cardBId ? [c.cardAId, c.cardBId] : [c.cardBId, c.cardAId];
    map.set(`${lo}_${hi}`, c);
  }
  return map;
}

// Compute the base (ba, bd) for a combo given the active mode.
function comboStats(
  combo: Combination,
  mode: OptimizeMode
): { ba: number; bd: number } {
  let ba = combo.ba0;
  let bd = combo.bd0;
  if (mode === 'attack' || mode === 'heroics') {
    ba = Math.round(ba * 1.5);
    bd = Math.round(bd * 0.5);
  } else if (mode === 'defence') {
    ba = Math.round(ba * 0.5);
    bd = Math.round(bd * 1.5);
  }
  return { ba, bd };
}

// The contribution of one pair, ignoring copy-reduction (computed at scoring time).
function pairContribution(
  combo: Combination,
  aFused: boolean,
  bFused: boolean,
  mode: OptimizeMode
): number {
  const { ba, bd } = comboStats(combo, mode);
  const fusionBuff = aFused || bFused ? 1.5 : 1.0;
  return Math.round((ba + bd) * fusionBuff);
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
      const [lo, hi] = a.cardId < b.cardId ? [a.cardId, b.cardId] : [b.cardId, a.cardId];
      const combo = comboMap.get(`${lo}_${hi}`);
      if (!combo) continue;
      const raw = pairContribution(combo, a.fused, b.fused, mode);
      const dupIndex = resultCount.get(combo.resultName) ?? 0;
      const reduction = Math.pow(0.93, dupIndex);
      score += Math.round(raw * reduction);
      resultCount.set(combo.resultName, dupIndex + 1);
    }
  }
  return score;
}

// Marginal gain of adding `candidate` to `instances` (ignores copy-reduction for
// speed; the final score is recomputed properly at the end). This is the inner
// loop of the greedy/beam searches, so we keep it allocation-light.
function marginalGain(
  candidate: CardInstance,
  instances: CardInstance[],
  comboMap: Map<string, Combination>,
  mode: OptimizeMode
): number {
  let gain = 0;
  for (let i = 0; i < instances.length; i++) {
    const d = instances[i];
    const [lo, hi] =
      candidate.cardId < d.cardId ? [candidate.cardId, d.cardId] : [d.cardId, candidate.cardId];
    const combo = comboMap.get(`${lo}_${hi}`);
    if (!combo) continue;
    gain += pairContribution(combo, candidate.fused, d.fused, mode);
  }
  return gain;
}

// Count how many copies of a cardId are already in the deck.
function countCopies(cardId: number, instances: CardInstance[]): number {
  let n = 0;
  for (const inst of instances) if (inst.cardId === cardId) n++;
  return n;
}

// Greedy quick-fill: repeatedly add the candidate with the highest marginal gain.
export function quickFill(
  start: CardInstance[],
  candidates: Candidate[],
  comboMap: Map<string, Combination>,
  mode: OptimizeMode,
  maxSize: number = DECK_MAX_SIZE
): FillResult {
  const t0 = Date.now();
  const instances = [...start];
  // Work on a mutable candidate pool.
  const pool = [...candidates];
  let iterations = 0;

  while (instances.length < maxSize && pool.length > 0) {
    let bestIdx = -1;
    let bestGain = -1;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      // Respect max 3 copies per card.
      if (countCopies(c.cardId, instances) >= MAX_COPIES_PER_CARD) continue;
      const gain = marginalGain(c, instances, comboMap, mode);
      iterations++;
      if (gain > bestGain) {
        bestGain = gain;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break; // no candidate fits (e.g. all cards at copy cap)
    instances.push({ cardId: pool[bestIdx].cardId, fused: pool[bestIdx].fused });
    pool.splice(bestIdx, 1);
  }

  return {
    instances,
    score: scoreDeck(instances, comboMap, mode),
    iterations,
    durationMs: Date.now() - t0,
  };
}

// Beam search advanced fill: keep the top-K partial decks at each step.
// At each step, expand each beam with every viable candidate, score the new
// beam (incrementally), and keep the best K.
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
  // Start beam: the current deck (or empty), scored.
  const initialScore = scoreDeck(start, comboMap, mode);
  const beams: Beam[] = [{ instances: [...start], score: initialScore }];
  let iterations = 0;

  while (beams[0].instances.length < maxSize) {
    const expanded: Beam[] = [];
    for (const beam of beams) {
      const usedCardIds = new Set<number>();
      // Track copies per cardId already in this beam to avoid re-adding capped cards.
      const copies = new Map<number, number>();
      for (const inst of beam.instances) {
        copies.set(inst.cardId, (copies.get(inst.cardId) ?? 0) + 1);
      }
      for (const c of candidates) {
        const cnt = copies.get(c.cardId) ?? 0;
        if (cnt >= MAX_COPIES_PER_CARD) continue;
        // Only consider each cardId once per beam expansion (take the best fused
        // variant) to avoid redundant beams.
        if (usedCardIds.has(c.cardId)) continue;
        // The marginal gain from adding this candidate.
        const gain = marginalGain(c, beam.instances, comboMap, mode);
        iterations++;
        if (gain <= 0 && beam.instances.length > 0) continue; // skip useless adds
        const newInstances = [...beam.instances, { cardId: c.cardId, fused: c.fused }];
        expanded.push({ instances: newInstances, score: beam.score + gain });
        usedCardIds.add(c.cardId);
      }
    }
    if (expanded.length === 0) break;
    // Keep the top-K beams by score.
    expanded.sort((a, b) => b.score - a.score);
    beams.length = 0;
    beams.push(...expanded.slice(0, beamWidth));
  }

  // Re-score the best beam properly (with copy reduction) for the final number.
  const best = beams[0];
  return {
    instances: best.instances,
    score: scoreDeck(best.instances, comboMap, mode),
    iterations,
    durationMs: Date.now() - t0,
  };
}

// Try-all: for each candidate as the sole seed, quick-fill the rest, keep the
// best full deck. Returns the best result found.
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

// Expand a library/deck item (with quantity + fused1/2/3) into a flat list of
// CardInstances. Used to convert stored items to the scoring representation.
export function expandItem(item: {
  cardId: number;
  quantity: number;
  fused1: boolean;
  fused2: boolean;
  fused3: boolean;
}): CardInstance[] {
  const out: CardInstance[] = [];
  if (item.quantity >= 1) out.push({ cardId: item.cardId, fused: item.fused1 });
  if (item.quantity >= 2) out.push({ cardId: item.cardId, fused: item.fused2 });
  if (item.quantity >= 3) out.push({ cardId: item.cardId, fused: item.fused3 });
  return out;
}

// Collapse a flat list of CardInstances back into a stored-item shape (one
// entry per cardId with quantity + fused1/2/3).
export function collapseInstances(instances: CardInstance[]): Array<{
  cardId: number;
  quantity: number;
  fused1: boolean;
  fused2: boolean;
  fused3: boolean;
}> {
  const byCard = new Map<number, boolean[]>();
  for (const inst of instances) {
    const arr = byCard.get(inst.cardId) ?? [];
    arr.push(inst.fused);
    byCard.set(inst.cardId, arr);
  }
  const out: Array<{
    cardId: number;
    quantity: number;
    fused1: boolean;
    fused2: boolean;
    fused3: boolean;
  }> = [];
  for (const [cardId, fusedArr] of byCard) {
    out.push({
      cardId,
      quantity: fusedArr.length,
      fused1: fusedArr[0] ?? false,
      fused2: fusedArr[1] ?? false,
      fused3: fusedArr[2] ?? false,
    });
  }
  return out;
}
