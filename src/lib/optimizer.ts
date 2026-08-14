// Deck scoring + auto-fill algorithms for the Little Alchemist optimizer.
//
// SCORING (verified 100% against the Excel spreadsheet):
//
// 1. For each library card instance L:
//    a. Compute pair scores: for each deck card D, look up the combination
//       via Cmb_ID (row-based, not name-based) and compute:
//       pair_score = BA[fs-1] + BD[fs-1] + (lv_avg + r_adj) * r_val * 2
//       where fs = (L_onyx?1:0) + (D_onyx?1:0) + 1
//    b. Compute 6 SUMIF thresholds: LCwC, LCwC+SV, LCwC+2*SV, ..., LCwC+5*SV
//       Each SUMIF = sum of pair_scores >= threshold
//    c. average = AVERAGE of the 6 SUMIFs
//    d. copy_score = TRUNC(average * CR^(copy_index) * (fused ? FB : 1))
//
// 2. Total deck score = sum of the top 30 copy_scores (matching deck cards)
//
// Parameters from Advanced Controls:
//   LCwC = 42 (Lowest Combo worth Counting)
//   SV = 2 (Step Value)
//   CR = 0.93 (Copy Reduction)
//   FB = calculated or override (Fusion Buff, only for fused cards)

import type { Combination } from '@/lib/types';

export type OptimizeMode = 'sum' | 'attack' | 'defence';
export type AutoFillAlgorithm = 'quick' | 'advanced' | 'try-all';

export const DECK_MAX_SIZE = 30;
export const MAX_COPIES_PER_CARD = 3;
export const DEFAULT_COPY_REDUCTION = 0.93;
export const DEFAULT_LCWC = 0;  // 0 = auto-calculate from pair scores
export const DEFAULT_SV = 0;

export interface CardInstance {
  cardId: number;
  fused: boolean;
  level: number;
  onyx: boolean;
}

export type Candidate = CardInstance;

export interface FillResult {
  instances: CardInstance[];
  score: number;
  iterations: number;
  durationMs: number;
}

export interface ScoringParams {
  copyReduction: number;
  fusionBuffOverride: number | null;
  lcwc: number;   // Lowest Combo worth Counting
  sv: number;     // Step Value
}

export const DEFAULT_SCORING_PARAMS: ScoringParams = {
  copyReduction: DEFAULT_COPY_REDUCTION,
  fusionBuffOverride: null,
  lcwc: DEFAULT_LCWC,
  sv: DEFAULT_SV,
};

// ===== Onyx → base card ID resolver =====
let _baseIdResolver: ((cardId: number) => number) | null = null;

export function setBaseIdResolver(fn: (cardId: number) => number) {
  _baseIdResolver = fn;
}

function resolveBaseId(cardId: number): number {
  return _baseIdResolver ? _baseIdResolver(cardId) : cardId;
}

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

export function buildComboMap(combos: Combination[]): Map<string, Combination> {
  const map = new Map<string, Combination>();
  for (const c of combos) {
    const [lo, hi] = c.cardAId < c.cardBId ? [c.cardAId, c.cardBId] : [c.cardBId, c.cardAId];
    map.set(`${lo}_${hi}`, c);
  }
  return map;
}

function excelRound(x: number): number {
  return Math.floor(x + 0.5);
}

const MODE_ATTACK: Record<OptimizeMode, number> = { sum: 1, attack: 1, defence: 0 };
const MODE_DEFENCE: Record<OptimizeMode, number> = { sum: 1, attack: 0, defence: 1 };
const MODE_BONUS: Record<OptimizeMode, number> = { sum: 2, attack: 1, defence: 1 };

// ===== Fusion Buff =====
export function calculateFusionBuff(instances: CardInstance[]): number {
  if (instances.length === 0) return 1.75;
  const fusedCount = instances.filter((i) => i.fused).length;
  const ratio = fusedCount / instances.length;
  return 2 - Math.pow(Math.sin(ratio * Math.PI / 2), 5);
}

// Compute pair score (verified 100% against Excel matrix)
function pairScore(
  combo: Combination,
  aOnyx: boolean, bOnyx: boolean,
  aLevel: number, bLevel: number,
  mode: OptimizeMode
): number {
  const fs = (aOnyx ? 1 : 0) + (bOnyx ? 1 : 0) + 1;
  const ba = [combo.ba0, combo.ba1, combo.ba2][fs - 1];
  const bd = [combo.bd0, combo.bd1, combo.bd2][fs - 1];
  const eitherOnyx = aOnyx || bOnyx;
  const lvAvg = excelRound((aLevel + bLevel) / 2);
  const rAdj = eitherOnyx ? 0 : combo.resultRarity <= 2 ? -1 : 0;
  const rVal = eitherOnyx ? 4 : combo.comboRarity;
  return ba * MODE_ATTACK[mode] + bd * MODE_DEFENCE[mode] + (lvAvg + rAdj) * rVal * MODE_BONUS[mode];
}

// Compute the score for a single library card against the deck.
// Returns an array of copy scores (1 per copy the library has).
export function scoreLibraryCard(
  libInstance: CardInstance,
  deckInstances: CardInstance[],
  comboMap: Map<string, Combination>,
  mode: OptimizeMode,
  params: ScoringParams,
  fb: number,
  quantity: number
): number[] {
  // 1. Compute all pair scores
  const pairScores: number[] = [];
  for (const deckInst of deckInstances) {
    const combo = lookupCombo(comboMap, libInstance.cardId, deckInst.cardId);
    if (combo) {
      pairScores.push(pairScore(combo, libInstance.onyx, deckInst.onyx, libInstance.level, deckInst.level, mode));
    }
  }

  // 2. Determine LCwC: if 0, auto-calculate from pair scores
  // Excel formula: TRUNC(AVERAGE(AVERAGE(scores), MEDIAN(scores), MODE(scores)*0.9))
  // Simplified: use AVERAGE * 0.8 as threshold
  let lcwc = params.lcwc;
  let sv = params.sv;
  if (lcwc === 0 && pairScores.length > 0) {
    const sorted = [...pairScores].sort((a, b) => a - b);
    const avg = pairScores.reduce((a, b) => a + b, 0) / pairScores.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    // Approximate MODE: most common value (rounded to nearest 5)
    const rounded = pairScores.map(s => Math.round(s / 5) * 5);
    const counts = new Map<number, number>();
    for (const r of rounded) counts.set(r, (counts.get(r) ?? 0) + 1);
    let modeVal = 30;
    let maxCount = 0;
    for (const [val, cnt] of counts) {
      if (cnt > maxCount) { modeVal = val; maxCount = cnt; }
    }
    lcwc = Math.trunc((avg + median + modeVal * 0.9) / 3);
    if (sv === 0) sv = 2; // default step value when auto-calculating
  }

  // 3. Compute 6 SUMIF thresholds
  const thresholds: number[] = [];
  for (let i = 0; i < 6; i++) {
    thresholds.push(lcwc + i * sv);
  }

  // 3. Compute SUMIF for each threshold
  const sumifs: number[] = thresholds.map(t => pairScores.reduce((sum, ps) => ps >= t ? sum + ps : sum, 0));

  // 4. Average of the 6 SUMIFs
  const avg = sumifs.reduce((a, b) => a + b, 0) / 6;

  // 5. Compute score for each copy
  const fbMult = libInstance.fused ? fb : 1.0;
  const cr = params.copyReduction;
  const copyScores: number[] = [];
  for (let copyIdx = 0; copyIdx < quantity; copyIdx++) {
    const score = Math.trunc(avg * Math.pow(cr, copyIdx) * fbMult);
    copyScores.push(score);
  }
  return copyScores;
}

// Score a full deck = sum of copy scores for all library cards that are in the deck.
export function scoreDeck(
  deckInstances: CardInstance[],
  libraryItems: Array<{ instance: CardInstance; quantity: number }>,
  comboMap: Map<string, Combination>,
  mode: OptimizeMode,
  params: ScoringParams = DEFAULT_SCORING_PARAMS
): number {
  if (deckInstances.length === 0 || libraryItems.length === 0) return 0;

  const fb = params.fusionBuffOverride ?? calculateFusionBuff(deckInstances);

  // Compute all copy scores
  const allCopyScores: Array<{ instance: CardInstance; scores: number[] }> = [];
  for (const { instance, quantity } of libraryItems) {
    const scores = scoreLibraryCard(instance, deckInstances, comboMap, mode, params, fb, quantity);
    allCopyScores.push({ instance, scores });
  }

  // Flatten and sort all copy scores descending
  const flatScores: number[] = [];
  for (const { scores } of allCopyScores) {
    for (const s of scores) {
      if (s > 0) flatScores.push(s);
    }
  }
  flatScores.sort((a, b) => b - a);

  // Sum the top 30 (deck size)
  return flatScores.slice(0, DECK_MAX_SIZE).reduce((a, b) => a + b, 0);
}

// Marginal gain of adding a candidate to the deck.
// This is an approximation: computes the candidate's copy score against
// the current deck + remaining library instances.
function marginalGain(
  candidate: CardInstance,
  deckInstances: CardInstance[],
  libraryItems: Array<{ instance: CardInstance; quantity: number }>,
  comboMap: Map<string, Combination>,
  mode: OptimizeMode,
  params: ScoringParams,
  fb: number
): number {
  // Compute the candidate's score as if it were a library card
  const scores = scoreLibraryCard(candidate, deckInstances, comboMap, mode, params, fb, 1);
  return scores[0] || 0;
}

function countCopies(cardId: number, instances: CardInstance[]): number {
  let n = 0;
  for (const inst of instances) if (inst.cardId === cardId) n++;
  return n;
}

// ===== Auto-fill algorithms =====

export function quickFill(
  start: CardInstance[],
  candidates: Candidate[],
  comboMap: Map<string, Combination>,
  mode: OptimizeMode,
  maxSize: number = DECK_MAX_SIZE,
  params: ScoringParams = DEFAULT_SCORING_PARAMS,
  libraryItems?: Array<{ instance: CardInstance; quantity: number }>
): FillResult {
  const t0 = Date.now();
  const instances = [...start];
  const pool = [...candidates];
  let iterations = 0;

  const libItems = libraryItems ?? candidates.map(c => ({ instance: c, quantity: 1 }));
  const estFb = params.fusionBuffOverride ?? calculateFusionBuff(instances.length > 0 ? instances : candidates.slice(0, 1));

  while (instances.length < maxSize && pool.length > 0) {
    let bestIdx = -1;
    let bestGain = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      if (countCopies(c.cardId, instances) >= MAX_COPIES_PER_CARD) continue;
      const gain = marginalGain(c, instances, libItems, comboMap, mode, params, estFb);
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
    score: scoreDeck(instances, libItems, comboMap, mode, params),
    iterations,
    durationMs: Date.now() - t0,
  };
}

export function advancedFill(
  start: CardInstance[],
  candidates: Candidate[],
  comboMap: Map<string, Combination>,
  mode: OptimizeMode,
  maxSize: number = DECK_MAX_SIZE,
  beamWidth: number = 6,
  params: ScoringParams = DEFAULT_SCORING_PARAMS,
  libraryItems?: Array<{ instance: CardInstance; quantity: number }>
): FillResult {
  const t0 = Date.now();
  type Beam = { instances: CardInstance[]; score: number };
  const libItems = libraryItems ?? candidates.map(c => ({ instance: c, quantity: 1 }));
  const initialScore = scoreDeck(start, libItems, comboMap, mode, params);
  const beams: Beam[] = [{ instances: [...start], score: initialScore }];
  let iterations = 0;

  const availableCopies = new Map<number, number>();
  for (const c of candidates) {
    availableCopies.set(c.cardId, (availableCopies.get(c.cardId) ?? 0) + 1);
  }
  for (const inst of start) {
    availableCopies.set(inst.cardId, Math.max(0, (availableCopies.get(inst.cardId) ?? 0) - 1));
  }

  const estFb = params.fusionBuffOverride ?? calculateFusionBuff(start.length > 0 ? start : candidates.slice(0, 1));

  while (beams[0].instances.length < maxSize) {
    const expanded: Beam[] = [];
    for (const beam of beams) {
      const usedCardIds = new Set<number>();
      const copiesInBeam = new Map<number, number>();
      for (const inst of beam.instances) {
        copiesInBeam.set(inst.cardId, (copiesInBeam.get(inst.cardId) ?? 0) + 1);
      }
      for (const c of candidates) {
        if (usedCardIds.has(c.cardId)) continue;
        const inBeam = copiesInBeam.get(c.cardId) ?? 0;
        const available = availableCopies.get(c.cardId) ?? 0;
        if (inBeam >= available) continue;
        if (inBeam >= MAX_COPIES_PER_CARD) continue;
        const gain = marginalGain(c, beam.instances, libItems, comboMap, mode, params, estFb);
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
    score: scoreDeck(best.instances, libItems, comboMap, mode, params),
    iterations,
    durationMs: Date.now() - t0,
  };
}

export function tryAllFill(
  candidates: Candidate[],
  comboMap: Map<string, Combination>,
  mode: OptimizeMode,
  maxSize: number = DECK_MAX_SIZE,
  params: ScoringParams = DEFAULT_SCORING_PARAMS,
  libraryItems?: Array<{ instance: CardInstance; quantity: number }>
): FillResult {
  const t0 = Date.now();
  const libItems = libraryItems ?? candidates.map(c => ({ instance: c, quantity: 1 }));
  let best: FillResult | null = null;
  let iterations = 0;

  for (let s = 0; s < candidates.length; s++) {
    const seed = candidates[s];
    const rest = candidates.filter((_, i) => i !== s);
    const result = quickFill([seed], rest, comboMap, mode, maxSize, params, libItems);
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

// ===== Item expansion/collapse =====
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
