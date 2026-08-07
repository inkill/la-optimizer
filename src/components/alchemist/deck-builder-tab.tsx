'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchActiveDeck, removeFromDeck, updateDeckItem, clearActiveDeck,
  fetchLibrary, addToDeck,
} from '@/lib/api';
import { DECK_MAX_SIZE } from '@/lib/types';
import { CardImage } from './card-image';
import { FusedCheckboxes } from './fused-checkboxes';
import { RarityBadge } from './rarity-badge';
import { DeckSwitcher } from './deck-switcher';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Loader2, Sparkles, Layers3, Swords, Shield, X, Plus, Trash2, Eraser,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function DeckBuilderTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['deck'], queryFn: fetchActiveDeck });
  const { data: libData } = useQuery({ queryKey: ['library'], queryFn: fetchLibrary });

  const deck = data?.deck;
  const items = deck?.items ?? [];
  const size = data?.size ?? 0;
  const deckIds = useMemo(() => new Set(items.map((d) => d.cardId)), [items]);

  const availableFromLibrary = useMemo(
    () => (libData?.library ?? []).filter((l) => !deckIds.has(l.cardId)),
    [libData, deckIds]
  );

  const [libFilter, setLibFilter] = useState('');
  const filteredAvail = useMemo(() => {
    const f = libFilter.toLowerCase().trim();
    if (!f) return availableFromLibrary;
    return availableFromLibrary.filter((l) => l.card.name.toLowerCase().includes(f));
  }, [availableFromLibrary, libFilter]);

  const removeMut = useMutation({
    mutationFn: (id: string) => removeFromDeck(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deck'] });
      qc.invalidateQueries({ queryKey: ['decks'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['optimize'] });
      toast.success('Removed from deck');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateDeckItem>[1] }) =>
      updateDeckItem(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deck'] });
      qc.invalidateQueries({ queryKey: ['decks'] });
      qc.invalidateQueries({ queryKey: ['optimize'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addMut = useMutation({
    mutationFn: (input: { cardId: number; level?: number; quantity?: number; fused1?: boolean; fused2?: boolean; fused3?: boolean }) =>
      addToDeck(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deck'] });
      qc.invalidateQueries({ queryKey: ['decks'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['optimize'] });
      toast.success('Added to deck');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearMut = useMutation({
    mutationFn: () => clearActiveDeck(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deck'] });
      qc.invalidateQueries({ queryKey: ['decks'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['optimize'] });
      toast.success('Deck cleared');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isFull = size >= DECK_MAX_SIZE;

  const rarityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of items) counts[d.card.rarity] = (counts[d.card.rarity] ?? 0) + d.quantity;
    return counts;
  }, [items]);
  const fusedCount = items.filter((d) => d.fused1 || d.fused2 || d.fused3).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Deck Builder</h2>
          <p className="text-sm text-muted-foreground">
            Build your battle deck of up to {DECK_MAX_SIZE} cards. A card can have up to 3 copies.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DeckSwitcher />
        </div>
      </div>

      {/* Quick stats + clear button */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'rounded-full px-3 py-1 text-sm font-medium',
            isFull ? 'bg-emerald-500/15 text-emerald-300' : 'bg-muted text-muted-foreground'
          )}
        >
          {size} / {DECK_MAX_SIZE} cards
        </span>
        <div className="grid flex-1 grid-cols-3 gap-2 sm:max-w-md sm:grid-cols-4">
          <StatChip icon={<Layers3 className="h-3.5 w-3.5" />} label="Types" value={items.length} />
          <StatChip icon={<Sparkles className="h-3.5 w-3.5" />} label="Fused" value={fusedCount} />
          <StatChip icon={<Swords className="h-3.5 w-3.5" />} label="Onyx" value={rarityCounts['Onyx'] ?? 0} />
          <StatChip icon={<Shield className="h-3.5 w-3.5" />} label="Rare" value={rarityCounts['Rare'] ?? 0} />
        </div>
        <Button
          variant="destructive"
          size="sm"
          className="ml-auto"
          onClick={() => clearMut.mutate()}
          disabled={items.length === 0 || clearMut.isPending}
        >
          <Eraser className="h-4 w-4" /> Clear Deck
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Deck list */}
        <div className="space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading deck…
            </div>
          ) : items.length > 0 ? (
            items.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border bg-card/60 p-2.5"
              >
                <CardImage card={item.card} className="h-12 w-10" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="truncate font-medium">{item.card.name}</h3>
                    {(item.fused1 || item.fused2 || item.fused3) && (
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RarityBadge rarity={item.card.rarity} className="scale-90" />
                    <span className="text-xs text-muted-foreground">{item.card.comboCount} combos</span>
                  </div>
                </div>

                <Select
                  value={String(item.level)}
                  onValueChange={(v) => updateMut.mutate({ id: item.id, input: { level: Number(v) } })}
                >
                  <SelectTrigger className="h-8 w-[68px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((lvl) => (
                      <SelectItem key={lvl} value={String(lvl)}>Lv {lvl}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Quantity stepper */}
                <div className="flex items-center rounded-md border">
                  <Button
                    size="icon" variant="ghost" className="h-8 w-7"
                    onClick={() => updateMut.mutate({ id: item.id, input: { quantity: Math.max(1, item.quantity - 1) } })}
                    disabled={item.quantity <= 1}
                  >
                    <Plus className="h-3 w-3 rotate-45" />
                  </Button>
                  <span className="w-6 text-center text-sm font-medium tabular-nums">{item.quantity}</span>
                  <Button
                    size="icon" variant="ghost" className="h-8 w-7"
                    onClick={() => updateMut.mutate({ id: item.id, input: { quantity: Math.min(3, item.quantity + 1) } })}
                    disabled={item.quantity >= 3 || size >= DECK_MAX_SIZE}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>

                <FusedCheckboxes
                  quantity={item.quantity}
                  fused1={item.fused1}
                  fused2={item.fused2}
                  fused3={item.fused3}
                  onChange={(f) => updateMut.mutate({ id: item.id, input: f })}
                />

                <Button
                  size="icon" variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeMut.mutate(item.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-muted-foreground">
              <Layers3 className="h-10 w-10 opacity-50" />
              <p>This deck is empty.</p>
              <p className="text-xs">Add cards from your collection, or use the Optimizer&apos;s auto-fill.</p>
            </div>
          )}
        </div>

        {/* Add-from-collection panel */}
        <div className="rounded-lg border bg-card/40 p-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">From your collection</h3>
            {isFull && <span className="text-xs text-amber-400">Deck full</span>}
          </div>
          <Input
            value={libFilter}
            onChange={(e) => setLibFilter(e.target.value)}
            placeholder="Filter…"
            className="mb-3 h-8"
          />
          {filteredAvail.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No available cards. All your cards are already in this deck.
            </p>
          ) : (
            <div className="max-h-[28rem] space-y-1.5 overflow-y-auto alchemist-scroll pr-1">
              {filteredAvail.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center gap-2 rounded-md border bg-background/50 px-2 py-1.5"
                >
                  <CardImage card={l.card} className="h-8 w-7" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{l.card.name}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span>Lv{l.level}</span>
                      <span>×{l.quantity}</span>
                      {(l.fused1 || l.fused2 || l.fused3) && <Sparkles className="h-3 w-3 text-amber-400" />}
                    </div>
                  </div>
                  <Button
                    size="sm" variant="outline" className="h-7 w-7 p-0"
                    disabled={isFull}
                    onClick={() =>
                      addMut.mutate({
                        cardId: l.cardId, level: l.level, quantity: l.quantity,
                        fused1: l.fused1, fused2: l.fused2, fused3: l.fused3,
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border bg-card/50 px-2.5 py-1.5">
      <span className="text-violet-300">{icon}</span>
      <div>
        <div className="text-sm font-bold leading-none tabular-nums">{value}</div>
        <div className="text-[10px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
