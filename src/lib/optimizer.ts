// Deck scoring + auto-fill algorithms for the Little Alchemist optimizer.
//
// SCORING (matches the Excel spreadsheet):
//
// The "deck score" = sum over ALL library card instances L of:
//   CR^(L_copy_index) × sum over all deck instances D of pair_score(L, D)
//
// Where:
//   - Library instances = all cards in the user's collection (expanded to copies)
//   - Deck instances = the 30 cards in the active deck
//   - Copy Reduction (CR, default 0.93) is applied to LIBRARY copies:
//     1st copy → ×CR⁰, 2nd → ×CR¹, 3rd → ×CR²
//   - Deck copies are NOT reduced (each deck slot is independent)
//   - Fusion Buff (FB) multiplies the BA+BD part of each pair score
//   - FB is auto-calculated: 2 − SIN((fused_count / deck_size) × π/2)⁵
//
// pair_score(L, D) = (BA[fused_scalar-1] × mode_attack + BD[fused_scalar-1] × mode_defence) × FB
//                   + (level_avg + rarity_adj) × rarity_value × mode_bonus
//
// Where fused_scalar = (L_onyx?1:0) + (D_onyx?1:0) + 1

import type { Combination } from '@/lib/types';

export type OptimizeMode = 'sum' | 'attack' | 'defence' | 'heroics';
export type AutoFillAlgorithm = 'quick' | 'advanced' | 'try-all';

export const DECK_MAX_SIZE = 30;
export const MAX_COPIES_PER_CARD = 3;
export const DEFAULT_COPY_REDUCTION = 0.93;

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

function excelRound(x: number): number {
  return Math.floor(x + 0.5);
}

const MODE_ATTACK: Record<OptimizeMode, number> = { sum: 1, attack: 1, defence: 0, heroics: 1.5 };
const MODE_DEFENCE: Record<OptimizeMode, number> = { sum: 1, attack: 0, defence: 1, heroics: 0.5 };
const MODE_BONUS: Record<OptimizeMode, number> = { sum: 2, attack: 1, defence: 1, heroics: 2 };

// ===== Fusion Buff =====
export function calculateFusionBuff(instances: CardInstance[]): number {
  if (instances.length === 0) return 1.75;
  const fusedCount = instances.filter((i) => i.fused).length;
  const ratio = fusedCount / instances.length;
  return 2 - Math.pow(Math.sin(ratio * Math.PI / 2), 5);
}

// Compute pair score between two card instances.
function pairScore(
  combo: Combination,
  aOnyx: boolean, bOnyx: boolean,
  aLevel: number, bLevel: number,
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
  const battlePart = (ba * MODE_ATTACK[mode] + bd * MODE_DEFENCE[mode]) * fusionBuff;
  const rarityPart = (levelAvg + rarityAdj) * rarityValue * MODE_BONUS[mode];
  return battlePart + rarityPart;
}

// Build copy indices for a list of instances (0-based per cardId).
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

// ===== DECK SCORE = sum of (library × deck) pairs =====
// Copy Reduction is applied to LIBRARY copies (not deck copies).
export function scoreDeck(
  deckInstances: CardInstance[],
  libraryInstances: CardInstance[],
  comboMap: Map<string, Combination>,
  mode: OptimizeMode,
  params: ScoringParams = DEFAULT_SCORING_PARAMS
): number {
  if (deckInstances.length === 0 || libraryInstances.length === 0) return 0;

  const fusionBuff = params.fusionBuffOverride ?? calculateFusionBuff(deckInstances);
  const cr = params.copyReduction;
  const libCopyIndices = buildCopyIndices(libraryInstances);

  let score = 0;
  for (let li = 0; li < libraryInstances.length; li++) {
    const lib = libraryInstances[li];
    const libCr = Math.pow(cr, libCopyIndices[li]); // CR for library copy
    let rowScore = 0;
    for (let di = 0; di < deckInstances.length; di++) {
      const deck = deckInstances[di];
      const combo = lookupCombo(comboMap, lib.cardId, deck.cardId);
      if (!combo) continue;
      rowScore += pairScore(combo, lib.onyx, deck.onyx, lib.level, deck.level, mode, fusionBuff);
    }
    score += Math.round(rowScore * libCr);
  }
  return score;
}

// ===== MARGINAL GAIN = candidate vs ALL library instances =====
function marginalGain(
  candidate: CardInstance,
  libraryInstances: CardInstance[],
  comboMap: Map<string, Combination>,
  mode: OptimizeMode,
  fusionBuff: number,
  copyReduction: number
): number {
  const libCopyIndices = buildCopyIndices(libraryInstances);
  const cr = copyReduction;
  let gain = 0;
  for (let li = 0; li < libraryInstances.length; li++) {
    const lib = libraryInstances[li];
    const combo = lookupCombo(comboMap, candidate.cardId, lib.cardId);
    if (!combo) continue;
    const raw = pairScore(combo, candidate.onyx, lib.onyx, candidate.level, lib.level, mode, fusionBuff);
    gain += raw * Math.pow(cr, libCopyIndices[li]);
  }
  return gain;
}

function countCopies(cardId: number, instances: CardInstance[]): number {
  let n = 0;
  for (const inst of instances) if (inst.cardId === cardId) n++;
  return n;
}

// ===== Auto-fill algorithms =====
// All algorithms maximize the library×deck score.

export function quickFill(
  start: CardInstance[],
  candidates: Candidate[],
  comboMap: Map<string, Combination>,
  mode: OptimizeMode,
  maxSize: number = DECK_MAX_SIZE,
  params: ScoringParams = DEFAULT_SCORING_PARAMS,
  libraryInstances?: CardInstance[]
): FillResult {
  const t0 = Date.now();
  const instances = [...start];
  const pool = [...candidates];
  let iterations = 0;

  // Use library instances for marginal gain calculation
  const libInsts = libraryInstances ?? candidates;
  const estFb = params.fusionBuffOverride ?? calculateFusionBuff(instances.length > 0 ? instances : candidates.slice(0, 1));

  while (instances.length < maxSize && pool.length > 0) {
    let bestIdx = -1;
    let bestGain = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      if (countCopies(c.cardId, instances) >= MAX_COPIES_PER_CARD) continue;
      const gain = marginalGain(c, libInsts, comboMap, mode, estFb, params.copyReduction);
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
    score: scoreDeck(instances, libInsts, comboMap, mode, params),
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
  libraryInstances?: CardInstance[]
): FillResult {
  const t0 = Date.now();
  type Beam = { instances: CardInstance[]; score: number };
  const libInsts = libraryInstances ?? candidates;
  const initialScore = scoreDeck(start, libInsts, comboMap, mode, params);
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
        const gain = marginalGain(c, libInsts, comboMap, mode, estFb, params.copyReduction);
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
    score: scoreDeck(best.instances, libInsts, comboMap, mode, params),
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
  libraryInstances?: CardInstance[]
): FillResult {
  const t0 = Date.now();
  const libInsts = libraryInstances ?? candidates;
  let best: FillResult | null = null;
  let iterations = 0;

  for (let s = 0; s < candidates.length; s++) {
    const seed = candidates[s];
    const rest = candidates.filter((_, i) => i !== s);
    const result = quickFill([seed], rest, comboMap, mode, maxSize, params, libInsts);
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
