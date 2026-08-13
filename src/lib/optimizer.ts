// Deck scoring + auto-fill algorithms for the Little Alchemist optimizer.
//
// Scoring formula (reverse-engineered from the Excel spreadsheet):
//
//   fused_scalar = (deck_onyx ? 1 : 0) + (lib_onyx ? 1 : 0) + 1
//   → selects overcharge level: 1→BA_0O/BD_0O, 2→BA_1O/BD_1O, 3→BA_2O/BD_2O
//
//   Fusion Buff (deck-level, calculated):
//     fb = 2 - SIN((fused_count / deck_size) * PI/2) ^ 5
//     Applied as multiplier to the BA+BD part of each pair score.
//
//   Copy Reduction (configurable, default 0.93):
//     Applied to duplicate CARDS (same cardId). If a card appears N times,
//     the Nth copy's pairs are multiplied by CR^(N-1).
//
//   pair_score = (BA[fused_scalar-1] * mode_attack + BD[fused_scalar-1] * mode_defence) * fusion_buff
//              + (level_avg + rarity_adj) * rarity_value * mode_bonus
//   pair_score *= copy_reduction_mult  (based on duplicate card indices)

import type { Combination } from '@/lib/types';

export type OptimizeMode = 'sum' | 'attack' | 'defence' | 'heroics';
export type AutoFillAlgorithm = 'quick' | 'advanced' | 'try-all';

export const DECK_MAX_SIZE = 30;
export const MAX_COPIES_PER_CARD = 3;
export const DEFAULT_COPY_REDUCTION = 0.93;

// A single card instance in the deck (one copy of a card, fused or not).
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

// Scoring parameters — configurable via the UI.
export interface ScoringParams {
  copyReduction: number;   // default 0.93 — penalty per duplicate card copy
  fusionBuffOverride: number | null; // null = auto-calculate; number = manual override
}

export const DEFAULT_SCORING_PARAMS: ScoringParams = {
  copyReduction: DEFAULT_COPY_REDUCTION,
  fusionBuffOverride: null,
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

// Excel-style rounding: round half up.
function excelRound(x: number): number {
  return Math.floor(x + 0.5);
}

// Mode multipliers
const MODE_ATTACK: Record<OptimizeMode, number> = { sum: 1, attack: 1, defence: 0, heroics: 1.5 };
const MODE_DEFENCE: Record<OptimizeMode, number> = { sum: 1, attack: 0, defence: 1, heroics: 0.5 };
const MODE_BONUS: Record<OptimizeMode, number> = { sum: 2, attack: 1, defence: 1, heroics: 2 };

// ===== Fusion Buff calculation =====
// Excel formula: =IFERROR(2 - POWER(SIN((fused_count / deck_size) * PI()/2), 5), 1.75)
// When deck is empty, returns the fallback 1.75.
export function calculateFusionBuff(instances: CardInstance[]): number {
  if (instances.length === 0) return 1.75;
  const fusedCount = instances.filter((i) => i.fused).length;
  const ratio = fusedCount / instances.length;
  const sinVal = Math.sin(ratio * Math.PI / 2);
  return 2 - Math.pow(sinVal, 5);
}

// Compute the base pair score (BA+BD part + rarity bonus part).
function pairScore(
  combo: Combination,
  aOnyx: boolean,
  bOnyx: boolean,
  aLevel: number,
  bLevel: number,
  mode: OptimizeMode,
  fusionBuff: number
): number {
  const fusedScalar = (aOnyx ? 1 : 0) + (bOnyx ? 1 : 0) + 1;
  const ba = [combo.ba0, combo.ba1, combo.ba2][fusedScalar - 1];
  const bd = [combo.bd0, combo.bd1, combo.bd2][fusedScalar - 1];

  const eitherOnyx = aOnyx || bOnyx;
  const levelAvg = excelRound((aLevel + bLevel) / 2);
  const rarityAdj = eitherOnyx ? 0 : combo.resultRarity <= 2 ? -1 : 0;
  const rarityValue = eitherOnyx ? 4 : combo.comboRarity;

  // BA+BD part is multiplied by Fusion Buff; rarity bonus is not.
  const battlePart = (ba * MODE_ATTACK[mode] + bd * MODE_DEFENCE[mode]) * fusionBuff;
  const rarityPart = (levelAvg + rarityAdj) * rarityValue * MODE_BONUS[mode];
  return battlePart + rarityPart;
}

// Assign copy indices to instances: for each cardId, the 1st copy gets index 0,
// 2nd gets 1, 3rd gets 2. Returns a map from instance position → copy index.
function buildCopyIndices(instances: CardInstance[]): number[] {
  const countPerCard = new Map<number, number>();
  const indices: number[] = [];
  for (const inst of instances) {
    const idx = countPerCard.get(inst.cardId) ?? 0;
    indices.push(idx);
    countPerCard.set(inst.cardId, idx + 1);
  }
  return indices;
}

// Score a full deck.
// Copy Reduction is applied per duplicate CARD: if card X appears 3 times,
// pairs involving the 2nd copy get ×CR, pairs involving the 3rd copy get ×CR².
// A pair (copy_N of cardA, copy_M of cardB) gets ×CR^((N-1)+(M-1)) = ×CR^(N+M-2).
export function scoreDeck(
  instances: CardInstance[],
  comboMap: Map<string, Combination>,
  mode: OptimizeMode,
  params: ScoringParams = DEFAULT_SCORING_PARAMS
): number {
  if (instances.length === 0) return 0;

  // Calculate Fusion Buff (or use override)
  const fusionBuff = params.fusionBuffOverride ?? calculateFusionBuff(instances);

  // Build copy indices for Copy Reduction
  const copyIndices = buildCopyIndices(instances);
  const cr = params.copyReduction;

  let score = 0;
  for (let i = 0; i < instances.length; i++) {
    for (let j = i + 1; j < instances.length; j++) {
      const a = instances[i];
      const b = instances[j];
      const combo = lookupCombo(comboMap, a.cardId, b.cardId);
      if (!combo) continue;
      const raw = pairScore(combo, a.onyx, b.onyx, a.level, b.level, mode, fusionBuff);
      // Copy Reduction: based on duplicate card indices
      // copyIdx_i and copyIdx_j are 0-based, so the reduction is CR^(sum of indices)
      const copyMult = Math.pow(cr, copyIndices[i] + copyIndices[j]);
      score += Math.round(raw * copyMult);
    }
  }
  return score;
}

// Marginal gain of adding `candidate` to `instances`.
function marginalGain(
  candidate: CardInstance,
  instances: CardInstance[],
  comboMap: Map<string, Combination>,
  mode: OptimizeMode,
  fusionBuff: number,
  copyReduction: number
): number {
  // The candidate would be the next copy of its cardId
  const candidateCopyIdx = countCopies(candidate.cardId, instances);

  let gain = 0;
  for (let i = 0; i < instances.length; i++) {
    const d = instances[i];
    const combo = lookupCombo(comboMap, candidate.cardId, d.cardId);
    if (!combo) continue;
    const raw = pairScore(combo, candidate.onyx, d.onyx, candidate.level, d.level, mode, fusionBuff);
    // Copy Reduction: candidate's copy index + existing instance's copy index
    const dCopyIdx = copyIndexOf(d.cardId, instances, i);
    const copyMult = Math.pow(copyReduction, candidateCopyIdx + dCopyIdx);
    gain += raw * copyMult;
  }
  return gain;
}

// Get the copy index (0-based) of the instance at position `pos`.
function copyIndexOf(cardId: number, instances: CardInstance[], pos: number): number {
  let idx = 0;
  for (let i = 0; i < pos; i++) {
    if (instances[i].cardId === cardId) idx++;
  }
  return idx;
}

function countCopies(cardId: number, instances: CardInstance[]): number {
  let n = 0;
  for (const inst of instances) if (inst.cardId === cardId) n++;
  return n;
}

// ===== Auto-fill algorithms =====
// All algorithms accept ScoringParams so the user's Copy Reduction / Fusion Buff
// settings affect the optimization.

export function quickFill(
  start: CardInstance[],
  candidates: Candidate[],
  comboMap: Map<string, Combination>,
  mode: OptimizeMode,
  maxSize: number = DECK_MAX_SIZE,
  params: ScoringParams = DEFAULT_SCORING_PARAMS
): FillResult {
  const t0 = Date.now();
  const instances = [...start];
  const pool = [...candidates];
  let iterations = 0;

  // Use a preliminary Fusion Buff for the gain estimate (will be recalculated
  // for the final score). Using the current instance set's fusion ratio.
  const estFb = params.fusionBuffOverride ?? calculateFusionBuff(instances.length > 0 ? instances : candidates.slice(0, 1));

  while (instances.length < maxSize && pool.length > 0) {
    let bestIdx = -1;
    let bestGain = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      if (countCopies(c.cardId, instances) >= MAX_COPIES_PER_CARD) continue;
      const gain = marginalGain(c, instances, comboMap, mode, estFb, params.copyReduction);
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
    score: scoreDeck(instances, comboMap, mode, params),
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
  params: ScoringParams = DEFAULT_SCORING_PARAMS
): FillResult {
  const t0 = Date.now();
  type Beam = { instances: CardInstance[]; score: number };
  const initialScore = scoreDeck(start, comboMap, mode, params);
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
        const gain = marginalGain(c, beam.instances, comboMap, mode, estFb, params.copyReduction);
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
    score: scoreDeck(best.instances, comboMap, mode, params),
    iterations,
    durationMs: Date.now() - t0,
  };
}

export function tryAllFill(
  candidates: Candidate[],
  comboMap: Map<string, Combination>,
  mode: OptimizeMode,
  maxSize: number = DECK_MAX_SIZE,
  params: ScoringParams = DEFAULT_SCORING_PARAMS
): FillResult {
  const t0 = Date.now();
  let best: FillResult | null = null;
  let iterations = 0;

  for (let s = 0; s < candidates.length; s++) {
    const seed = candidates[s];
    const rest = candidates.filter((_, i) => i !== s);
    const result = quickFill([seed], rest, comboMap, mode, maxSize, params);
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
