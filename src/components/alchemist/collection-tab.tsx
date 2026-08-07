'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchLibrary,
  updateLibraryItem,
  removeFromLibrary,
  fetchActiveDeck,
  addToDeck,
} from '@/lib/api';
import type { LibraryItem } from '@/lib/types';
import { CardImage } from './card-image';
import { FusedCheckboxes } from './fused-checkboxes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RarityBadge } from './rarity-badge';
import { PackageOpen, Loader2, Trash2, Minus, Plus, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export function CollectionTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['library'], queryFn: fetchLibrary });
  const { data: deckData } = useQuery({ queryKey: ['deck'], queryFn: fetchActiveDeck });

  const deckIds = useMemo(
    () => new Set(deckData?.deck?.items.map((d) => d.cardId) ?? []),
    [deckData]
  );

  const [filter, setFilter] = useState('');
  const items = useMemo(() => {
    const list = data?.library ?? [];
    if (!filter.trim()) return list;
    const f = filter.toLowerCase();
    return list.filter((l) => l.card.name.toLowerCase().includes(f));
  }, [data, filter]);

  const updateMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateLibraryItem>[1] }) =>
      updateLibraryItem(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['optimize'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => removeFromLibrary(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      toast.success('Removed from library');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addDeckMut = useMutation({
    mutationFn: (item: LibraryItem) =>
      addToDeck({
        cardId: item.cardId,
        level: item.level,
        quantity: item.quantity,
        fused1: item.fused1,
        fused2: item.fused2,
        fused3: item.fused3,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deck'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['optimize'] });
      toast.success('Added to deck');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">My Collection</h2>
          <p className="text-sm text-muted-foreground">
            Cards you own. Set each card&apos;s level, quantity (up to 3 copies), and per-copy
            fused state. Send cards to your battle deck from here.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{data?.library.length ?? 0}</span> unique
          cards ·{' '}
          <span className="font-medium text-foreground">
            {data?.library.reduce((s, l) => s + l.quantity, 0) ?? 0}
          </span>{' '}
          total
        </div>
      </div>

      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter your collection…"
        className="max-w-sm"
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading collection…
        </div>
      ) : items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => (
            <CollectionRow
              key={item.id}
              item={item}
              inDeck={deckIds.has(item.cardId)}
              onUpdate={(input) => updateMut.mutate({ id: item.id, input })}
              onRemove={() => removeMut.mutate(item.id)}
              onAddToDeck={() => addDeckMut.mutate(item)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground">
          <PackageOpen className="h-10 w-10 opacity-50" />
          <p>
            {filter
              ? 'No matching cards in your collection.'
              : 'Your collection is empty.'}
          </p>
        </div>
      )}
    </div>
  );
}

function CollectionRow({
  item, inDeck, onUpdate, onRemove, onAddToDeck,
}: {
  item: LibraryItem;
  inDeck: boolean;
  onUpdate: (input: { level?: number; quantity?: number; fused1?: boolean; fused2?: boolean; fused3?: boolean }) => void;
  onRemove: () => void;
  onAddToDeck: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card/60 p-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <CardImage card={item.card} className="h-12 w-10" />
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{item.card.name}</h3>
          <div className="mt-0.5 flex items-center gap-1.5">
            <RarityBadge rarity={item.card.rarity} className="scale-90" />
            <span className="text-xs text-muted-foreground">{item.card.comboCount} combos</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Level */}
        <Select
          value={String(item.level)}
          onValueChange={(v) => onUpdate({ level: Number(v) })}
        >
          <SelectTrigger className="h-8 w-[72px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5].map((lvl) => (
              <SelectItem key={lvl} value={String(lvl)}>Lv {lvl}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Quantity stepper (1-3) */}
        <div className="flex items-center rounded-md border">
          <Button
            size="icon" variant="ghost" className="h-8 w-8"
            onClick={() => onUpdate({ quantity: Math.max(1, item.quantity - 1) })}
            disabled={item.quantity <= 1}
            aria-label="Decrease quantity"
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="w-7 text-center text-sm font-medium tabular-nums">{item.quantity}</span>
          <Button
            size="icon" variant="ghost" className="h-8 w-8"
            onClick={() => onUpdate({ quantity: Math.min(3, item.quantity + 1) })}
            disabled={item.quantity >= 3}
            aria-label="Increase quantity"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* 3 fused checkboxes */}
        <FusedCheckboxes
          quantity={item.quantity}
          fused1={item.fused1}
          fused2={item.fused2}
          fused3={item.fused3}
          onChange={onUpdate}
        />

        <Button
          size="sm" variant="secondary" className="h-8"
          onClick={onAddToDeck}
          disabled={inDeck}
        >
          {inDeck ? 'In Deck' : <><ArrowRight className="h-3.5 w-3.5" /> Deck</>}
        </Button>

        <Button
          size="icon" variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label="Remove from library"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
