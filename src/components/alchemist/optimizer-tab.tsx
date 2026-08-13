'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchOptimize, fetchActiveDeck, autoFill } from '@/lib/api';
import { calculateFusionBuff, DEFAULT_SCORING_PARAMS, type ScoringParams } from '@/lib/optimizer';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Loader2, Sparkles, Swords, Shield, Trophy, TrendingUp, Zap, Plus, Crown, Gauge,
  Wand2, BrainCircuit, Shuffle, Settings2,
} from 'lucide-react';
import { rarityFromCode, RARITIES } from '@/lib/rarity';
import { RarityBadge } from './rarity-badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { AutoFillResult } from '@/lib/types';

type Mode = 'sum' | 'attack' | 'defence' | 'heroics';
type Algo = 'quick' | 'advanced' | 'try-all';

const MODES: Array<{ value: Mode; label: string; icon: React.ReactNode; desc: string }> = [
  { value: 'sum', label: 'Sum', icon: <Gauge className="h-4 w-4" />, desc: 'Balanced attack + defence' },
  { value: 'attack', label: 'Attack', icon: <Swords className="h-4 w-4" />, desc: '×1.5 attack, ×0.5 defence' },
  { value: 'defence', label: 'Defence', icon: <Shield className="h-4 w-4" />, desc: '×0.5 attack, ×1.5 defence' },
  { value: 'heroics', label: 'Heroics', icon: <Zap className="h-4 w-4" />, desc: 'Same as attack mode' },
];

const ALGOS: Array<{
  value: Algo; label: string; icon: React.ReactNode; desc: string;
}> = [
  {
    value: 'quick',
    label: 'Quick Fill',
    icon: <Wand2 className="h-4 w-4" />,
    desc: 'Greedy: repeatedly add the card with the highest marginal gain. Fast.',
  },
  {
    value: 'advanced',
    label: 'Advanced Fill',
    icon: <BrainCircuit className="h-4 w-4" />,
    desc: 'Beam search (width 6): keeps the top partial decks at each step for a better result.',
  },
  {
    value: 'try-all',
    label: 'Try All Cards as Start',
    icon: <Shuffle className="h-4 w-4" />,
    desc: 'Tries each library card as the seed, quick-fills the rest, keeps the best deck.',
  },
];

export function OptimizerTab() {
  const [mode, setMode] = useState<Mode>('sum');
  const [keepCurrent, setKeepCurrent] = useState(false);
  const [lastFill, setLastFill] = useState<AutoFillResult | null>(null);

  // Scoring parameters — configurable by the user
  const [copyReduction, setCopyReduction] = useState(DEFAULT_SCORING_PARAMS.copyReduction);
  const [fusionBuffOverride, setFusionBuffOverride] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const params: ScoringParams = useMemo(() => ({
    copyReduction,
    fusionBuffOverride,
  }), [copyReduction, fusionBuffOverride]);

  const { data: deckData } = useQuery({ queryKey: ['deck'], queryFn: fetchActiveDeck });
  const { data, isLoading } = useQuery({
    queryKey: ['optimize', mode, copyReduction, fusionBuffOverride],
    queryFn: () => fetchOptimize(mode, params),
  });

  const qc = useQueryClient();
  const fillMut = useMutation({
    mutationFn: (algo: Algo) => autoFill({ algorithm: algo, mode, keepCurrent, params }),
    onSuccess: (result) => {
      setLastFill(result);
      qc.invalidateQueries({ queryKey: ['deck'] });
      qc.invalidateQueries({ queryKey: ['decks'] });
      qc.invalidateQueries({ queryKey: ['optimize'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      toast.success(
        `${result.algorithm}: score ${result.score.toLocaleString()} in ${result.durationMs}ms (${result.deckSize} cards)`
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deckSize = deckData?.size ?? 0;

  // Calculate the current Fusion Buff for display
  const calculatedFb = useMemo(() => {
    if (!deckData?.deck?.items) return null;
    const instances = deckData.deck.items.flatMap((it: any) => {
      const out = [];
      if (it.quantity >= 1) out.push({ fused: it.fused1 });
      if (it.quantity >= 2) out.push({ fused: it.fused2 });
      if (it.quantity >= 3) out.push({ fused: it.fused3 });
      return out;
    });
    return calculateFusionBuff(instances);
  }, [deckData]);

  const effectiveFb = fusionBuffOverride ?? calculatedFb;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Deck Optimizer</h2>
        <p className="text-sm text-muted-foreground">
          Scores your active deck and auto-fills it from your library. Pick a scoring mode, then
          run one of the auto-fill algorithms.
        </p>
      </div>

      {/* Mode selector */}
      <div>
        <div className="mb-2 text-sm font-medium">Scoring Mode</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={cn(
                'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all',
                mode === m.value
                  ? 'border-violet-400 bg-violet-500/10'
                  : 'border-border bg-card/40 hover:border-violet-400/50'
              )}
            >
              <div className="flex items-center gap-2">
                <span className={mode === m.value ? 'text-violet-300' : 'text-muted-foreground'}>
                  {m.icon}
                </span>
                <span className="font-medium">{m.label}</span>
              </div>
              <span className="text-xs text-muted-foreground">{m.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Auto-fill section */}
      <section className="rounded-xl border bg-card/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-amber-400" />
          <h3 className="font-semibold">Auto-Fill Deck</h3>
        </div>
        <div className="mb-3 flex items-center gap-2">
          <Checkbox
            id="keep-current"
            checked={keepCurrent}
            onCheckedChange={(v) => setKeepCurrent(v === true)}
          />
          <Label htmlFor="keep-current" className="text-sm cursor-pointer">
            Keep current deck cards (fill the remaining slots only)
          </Label>
        </div>

        {/* Advanced scoring parameters */}
        <div className="mb-3">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Advanced scoring parameters
            <span className="text-xs">({showAdvanced ? 'hide' : 'show'})</span>
          </button>
          {showAdvanced && (
            <div className="mt-3 space-y-4 rounded-lg border bg-background/40 p-4">
              {/* Copy Reduction */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Copy Reduction</Label>
                  <span className="text-sm font-mono text-violet-300">{copyReduction.toFixed(2)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Penalty per duplicate card copy in the deck. Lower = stronger penalty for duplicates.
                  (Excel default: 0.93)
                </p>
                <div className="flex items-center gap-3">
                  <Slider
                    value={[copyReduction]}
                    onValueChange={(v) => setCopyReduction(v[0])}
                    min={0.5}
                    max={1.0}
                    step={0.01}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    value={copyReduction}
                    onChange={(e) => setCopyReduction(parseFloat(e.target.value) || 0.93)}
                    step={0.01}
                    min={0}
                    max={1}
                    className="w-20 h-8"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => setCopyReduction(0.93)}
                  >
                    Reset
                  </Button>
                </div>
              </div>

              {/* Fusion Buff */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Fusion Buff</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-amber-300">
                      {effectiveFb !== null ? effectiveFb.toFixed(4) : '—'}
                    </span>
                    {fusionBuffOverride !== null && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => setFusionBuffOverride(null)}
                      >
                        Auto
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Multiplier applied to the BA+BD part of each pair score.
                  Auto-calculated: <span className="font-mono">2 − SIN(fused_ratio × π/2)⁵</span>
                  {calculatedFb !== null && (
                    <> → current: <span className="font-mono text-amber-300">{calculatedFb.toFixed(4)}</span></>
                  )}
                </p>
                {fusionBuffOverride !== null ? (
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[fusionBuffOverride]}
                      onValueChange={(v) => setFusionBuffOverride(v[0])}
                      min={1.0}
                      max={2.0}
                      step={0.01}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={fusionBuffOverride}
                      onChange={(e) => setFusionBuffOverride(parseFloat(e.target.value) || 1.75)}
                      step={0.01}
                      min={1}
                      max={2}
                      className="w-20 h-8"
                    />
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setFusionBuffOverride(calculatedFb ?? 1.75)}
                  >
                    Override manually
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {ALGOS.map((a) => (
            <button
              key={a.value}
              onClick={() => fillMut.mutate(a.value)}
              disabled={fillMut.isPending}
              className={cn(
                'group flex flex-col items-start gap-1.5 rounded-lg border border-border bg-background/50 p-3 text-left transition-all',
                'hover:border-amber-400/60 hover:bg-amber-500/5',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
            >
              <div className="flex items-center gap-2 text-amber-300">
                {a.icon}
                <span className="font-medium text-foreground">{a.label}</span>
              </div>
              <span className="text-xs text-muted-foreground">{a.desc}</span>
            </button>
          ))}
        </div>
        {fillMut.isPending && (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Running auto-fill… (this may take a moment)
          </div>
        )}
        {lastFill && !fillMut.isPending && (
          <div className="mt-3 rounded-md border border-emerald-400/30 bg-emerald-500/5 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-medium text-emerald-300">
                {ALGOS.find((a) => a.value === lastFill.algorithm)?.label}
              </span>
              <span>
                Score: <span className="font-bold tabular-nums">{lastFill.score.toLocaleString()}</span>
              </span>
              <span>{lastFill.deckSize} cards</span>
              <span className="text-muted-foreground">
                {lastFill.iterations.toLocaleString()} iterations · {lastFill.durationMs}ms
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Score display */}
      {isLoading || !data ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Optimizing deck…
        </div>
      ) : deckSize === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-muted-foreground">
          <Trophy className="h-10 w-10 opacity-50" />
          <p>Your deck is empty.</p>
          <p className="text-xs">Run an auto-fill above, or add cards in the Deck Builder.</p>
        </div>
      ) : (
        <OptimizerResult data={data} />
      )}
    </div>
  );
}

function OptimizerResult({ data }: { data: import('@/lib/types').OptimizeResult }) {
  const { score, breakdown, pairs, suggestions, deckSize } = data;

  return (
    <div className="space-y-5">
      {/* Score hero */}
      <div className="relative overflow-hidden rounded-xl border border-violet-400/30 bg-gradient-to-br from-violet-600/15 via-card to-amber-500/10 p-6">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-violet-500/20 blur-3xl alchemist-glow" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Trophy className="h-4 w-4 text-amber-400" />
              Deck Score · {data.mode} mode
            </div>
            <div className="mt-1 text-5xl font-bold tabular-nums text-foreground">
              {score.toLocaleString()}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Based on {breakdown.comboCount} valid combinations across {deckSize} cards
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="Combos" value={breakdown.comboCount} />
            <MiniStat label="Fused" value={breakdown.fusedCount} />
            <MiniStat label="Cards" value={deckSize} />
          </div>
        </div>

        {/* Rarity distribution bar */}
        <div className="relative mt-5">
          <div className="mb-1 text-xs text-muted-foreground">Deck composition</div>
          <div className="flex h-3 overflow-hidden rounded-full bg-muted">
            {RARITIES.map((r) => {
              const count = breakdown.rarityCounts[r] ?? 0;
              if (count === 0) return null;
              const pct = (count / deckSize) * 100;
              return (
                <div
                  key={r}
                  style={{ width: `${pct}%`, backgroundColor: `var(--rarity-${r.toLowerCase()})` }}
                  title={`${r}: ${count}`}
                />
              );
            })}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-3 text-xs">
            {RARITIES.map((r) => {
              const count = breakdown.rarityCounts[r] ?? 0;
              if (count === 0) return null;
              return (
                <span key={r} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: `var(--rarity-${r.toLowerCase()})` }} />
                  <span className="text-muted-foreground">{r}</span>
                  <span className="font-medium">{count}</span>
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Top scoring pairs */}
        <section className="rounded-xl border bg-card/50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-400" />
            <h3 className="font-semibold">Top Scoring Pairs</h3>
          </div>
          {pairs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No scoring combinations found in this deck.
            </p>
          ) : (
            <div className="max-h-96 space-y-1.5 overflow-y-auto alchemist-scroll pr-1">
              {pairs.map((p, idx) => {
                const rarity = rarityFromCode(p.resultRarity);
                return (
                  <div key={idx} className="flex items-center gap-2 rounded-md border bg-background/40 px-2.5 py-1.5 text-sm">
                    <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate">
                        <span className="font-medium">{p.a}</span>
                        <span className="text-muted-foreground"> + </span>
                        <span className="font-medium">{p.b}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="truncate">→ {p.result}</span>
                        <RarityBadge rarity={rarity} className="scale-90" />
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="flex items-center gap-1 rounded bg-red-500/10 px-1.5 py-0.5 text-xs text-red-300">
                        <Swords className="h-3 w-3" />{p.ba}
                      </span>
                      <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-300">
                        <Shield className="h-3 w-3" />{p.bd}
                      </span>
                      <span className="w-12 text-right font-semibold tabular-nums text-amber-300">
                        +{p.contribution}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Suggestions */}
        <section className="rounded-xl border bg-card/50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <h3 className="font-semibold">Suggested Additions</h3>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Cards from your library not yet in the deck, ranked by marginal score gain.
          </p>
          {suggestions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No suggestions. Your deck already contains all your library cards.
            </p>
          ) : (
            <div className="max-h-96 space-y-1.5 overflow-y-auto alchemist-scroll pr-1">
              {suggestions.map((s, idx) => (
                <div key={s.cardId} className="flex items-center gap-2 rounded-md border bg-background/40 px-2.5 py-1.5 text-sm">
                  <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{s.name}</span>
                      {s.fused && <Sparkles className="h-3 w-3 shrink-0 text-amber-400" />}
                      <RarityBadge rarity={s.rarity} className="scale-90" />
                    </div>
                    <div className="text-xs text-muted-foreground">Lv {s.level}</div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-emerald-300">+{s.gain}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-background/40 px-3 py-2 text-center">
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
