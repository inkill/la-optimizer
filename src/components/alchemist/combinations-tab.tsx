'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCards, fetchCombinations } from '@/lib/api';
import type { Card } from '@/lib/types';
import { rarityFromCode } from '@/lib/rarity';
import { RarityBadge } from './rarity-badge';
import { CardImage } from './card-image';
import { Input } from '@/components/ui/input';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import {
  Swords, Shield, Check, ChevronsUpDown, Search, Loader2, FlaskConical, ArrowRight, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function CombinationsTab() {
  const [selected, setSelected] = useState<Card | null>(null);
  const [resultSearch, setResultSearch] = useState('');

  // All combinations involving the selected card (single-card mode).
  const combosQuery = useQuery({
    queryKey: ['combos-for-card', selected?.id],
    queryFn: () => fetchCombinations({ a: selected!.name, limit: 500 }),
    enabled: !!selected,
  });

  // Reverse recipe search: by result name.
  const resultQuery = useQuery({
    queryKey: ['combos-result', resultSearch],
    queryFn: () => fetchCombinations({ result: resultSearch, limit: 200 }),
    enabled: resultSearch.length >= 2,
  });

  return (
    <div className="space-y-6">
      {/* Single-card combination finder */}
      <section className="rounded-xl border bg-card/50 p-5">
        <div className="mb-3 flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-violet-400" />
          <h2 className="text-lg font-semibold">Combination Finder</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Select a card to see every combination it participates in — the partner card, the
          resulting card, its rarity, and battle stats at 0 / 1 / 2 overcharge.
        </p>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* Selected card preview */}
          <div className="flex shrink-0 flex-col items-center gap-2">
            {selected ? (
              <div className="relative">
                <CardImage card={selected} className="h-40 w-30" />
                <button
                  onClick={() => setSelected(null)}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow hover:scale-110"
                  aria-label="Clear selection"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex h-40 w-30 items-center justify-center rounded-lg border border-dashed text-center text-xs text-muted-foreground">
                Pick a card
              </div>
            )}
          </div>

          {/* Picker + results */}
          <div className="min-w-0 flex-1">
            <CardPicker selected={selected} onSelect={setSelected} />

            {!selected ? (
              <p className="mt-4 py-6 text-center text-sm text-muted-foreground">
                Choose a card above to list its combinations.
              </p>
            ) : combosQuery.isLoading ? (
              <div className="mt-4 flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Brewing combinations…
              </div>
            ) : combosQuery.data && combosQuery.data.combos.length > 0 ? (
              <div className="mt-4">
                <div className="mb-2 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {combosQuery.data.combos.length}
                  </span>{' '}
                  combinations found
                </div>
                <div className="max-h-[32rem] space-y-1.5 overflow-y-auto alchemist-scroll pr-1">
                  {combosQuery.data.combos.map((c) => {
                    const partner = c.cardAId === selected.id ? c.cardB : c.cardA;
                    const rarity = rarityFromCode(c.resultRarity);
                    return (
                      <div
                        key={c.id}
                        className="flex flex-col gap-2 rounded-lg border bg-background/50 p-2.5 text-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <CardImage card={partner} className="h-8 w-8" />
                          <span className="font-medium">{partner.name}</span>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-semibold">{c.resultName}</span>
                          <RarityBadge rarity={rarity} className="scale-90" />
                        </div>
                        <div className="flex gap-2 text-xs">
                          <span className="flex items-center gap-1 rounded bg-red-500/10 px-1.5 py-0.5 font-mono text-red-300">
                            <Swords className="h-3 w-3" />
                            {c.ba0}/{c.ba1}/{c.ba2}
                          </span>
                          <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-emerald-300">
                            <Shield className="h-3 w-3" />
                            {c.bd0}/{c.bd1}/{c.bd2}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="mt-4 py-6 text-center text-sm text-muted-foreground">
                This card has no combinations.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Reverse recipe finder */}
      <section className="rounded-xl border bg-card/50 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Search className="h-5 w-5 text-amber-400" />
          <h2 className="text-lg font-semibold">Recipe Finder</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Search for a result card by name to see every recipe (pair of ingredients) that
          produces it.
        </p>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={resultSearch}
            onChange={(e) => setResultSearch(e.target.value)}
            placeholder="e.g. Steam, Dragon, Angel of Valor…"
            className="pl-9"
          />
        </div>

        {resultSearch.length >= 2 && (
          <div className="mt-4">
            {resultQuery.isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching recipes…
              </div>
            ) : resultQuery.data && resultQuery.data.combos.length > 0 ? (
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {resultQuery.data.combos.length}
                  </span>{' '}
                  recipe{resultQuery.data.combos.length > 1 ? 's' : ''} found
                </div>
                <div className="max-h-[28rem] space-y-2 overflow-y-auto alchemist-scroll pr-1">
                  {resultQuery.data.combos.map((c) => {
                    const rarity = rarityFromCode(c.resultRarity);
                    return (
                      <div
                        key={c.id}
                        className="flex flex-col gap-2 rounded-lg border bg-background/50 p-2.5 text-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{c.cardA.name}</span>
                          <span className="text-muted-foreground">+</span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{c.cardB.name}</span>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">{c.resultName}</span>
                          <RarityBadge rarity={rarity} className="scale-90" />
                        </div>
                        <div className="flex gap-2 text-xs">
                          <span className="flex items-center gap-1 rounded bg-red-500/10 px-1.5 py-0.5 font-mono text-red-300">
                            <Swords className="h-3 w-3" />
                            {c.ba0}/{c.ba1}/{c.ba2}
                          </span>
                          <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-emerald-300">
                            <Shield className="h-3 w-3" />
                            {c.bd0}/{c.bd1}/{c.bd2}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No recipes found. Try a different result name.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// A searchable card picker using the Command (cmdk) component.
function CardPicker({
  selected,
  onSelect,
}: {
  selected: Card | null;
  onSelect: (card: Card | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data } = useQuery({
    queryKey: ['cards-picker', search],
    queryFn: () => fetchCards({ q: search, limit: 50, sort: 'name', dir: 'asc' }),
  });
  const cards = useMemo(() => data?.cards ?? [], [data]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between sm:w-[280px]"
        >
          {selected ? (
            <span className="flex items-center gap-2">
              <span className="font-medium">{selected.name}</span>
              <RarityBadge rarity={selected.rarity} className="scale-90" />
            </span>
          ) : (
            'Select a card…'
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search cards…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No card found.</CommandEmpty>
            <CommandGroup>
              {cards.map((c) => (
                <CommandItem
                  key={c.id}
                  value={String(c.id)}
                  onSelect={() => {
                    onSelect(c);
                    setOpen(false);
                  }}
                >
                  <CardImage card={c} className="h-7 w-7" />
                  <span className="flex-1">{c.name}</span>
                  <Check
                    className={cn(
                      'mr-1 h-4 w-4',
                      selected?.id === c.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <RarityBadge rarity={c.rarity} className="scale-90" />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
