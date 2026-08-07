'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchCards, addToLibrary, addToDeck, fetchLibrary, fetchActiveDeck } from '@/lib/api';
import type { Card } from '@/lib/types';
import { CardTile } from './card-tile';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Search, Loader2, PackageOpen } from 'lucide-react';
import { toast } from 'sonner';
import { RARITIES } from '@/lib/rarity';

interface LibraryTabProps {
  onSelectCard: (card: Card) => void;
}

export function LibraryTab({ onSelectCard }: LibraryTabProps) {
  const [q, setQ] = useState('');
  const [rarity, setRarity] = useState<string>('all');
  const [sort, setSort] = useState<'name' | 'rarity' | 'comboCount'>('name');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');

  const qc = useQueryClient();
  const { data: libraryData } = useQuery({ queryKey: ['library'], queryFn: fetchLibrary });
  const { data: deckData } = useQuery({ queryKey: ['deck'], queryFn: fetchActiveDeck });

  const libraryIds = useMemo(
    () => new Set(libraryData?.library.map((l) => l.cardId) ?? []),
    [libraryData]
  );
  const deckIds = useMemo(
    () => new Set(deckData?.deck?.items.map((d) => d.cardId) ?? []),
    [deckData]
  );

  const { data, isLoading } = useQuery({
    queryKey: ['cards', q, rarity, sort, dir],
    queryFn: () =>
      fetchCards({
        q: q || undefined,
        rarity: rarity === 'all' ? undefined : rarity,
        sort, dir,
        limit: 500,
      }),
  });

  const addLibMut = useMutation({
    mutationFn: (cardId: number) => addToLibrary({ cardId, level: 5, quantity: 1, fused1: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      toast.success('Added to library');
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const addDeckMut = useMutation({
    mutationFn: (cardId: number) => addToDeck({ cardId, level: 5, quantity: 1, fused1: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deck'] });
      qc.invalidateQueries({ queryKey: ['decks'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['optimize'] });
      toast.success('Added to deck');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search cards by name…"
            className="pl-9"
          />
        </div>
        <Select value={rarity} onValueChange={setRarity}>
          <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Rarity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All rarities</SelectItem>
            {RARITIES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Sort by name</SelectItem>
            <SelectItem value="rarity">Sort by rarity</SelectItem>
            <SelectItem value="comboCount">Sort by combos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dir} onValueChange={(v) => setDir(v as typeof dir)}>
          <SelectTrigger className="w-full sm:w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="asc">Ascending</SelectItem>
            <SelectItem value="desc">Descending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="text-sm text-muted-foreground">
        {isLoading ? 'Loading…' : (
          <>Showing <span className="font-medium text-foreground">{data?.cards.length ?? 0}</span> of <span className="font-medium text-foreground">{data?.total ?? 0}</span> cards</>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading cards…
        </div>
      ) : data && data.cards.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {data.cards.map((card) => (
            <CardTile
              key={card.id}
              card={card}
              showActions
              inLibrary={libraryIds.has(card.id)}
              inDeck={deckIds.has(card.id)}
              onAddToLibrary={(c) => addLibMut.mutate(c.id)}
              onAddToDeck={(c) => addDeckMut.mutate(c.id)}
              onClick={onSelectCard}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground">
          <PackageOpen className="h-10 w-10 opacity-50" />
          <p>No cards match your search.</p>
        </div>
      )}
    </div>
  );
}
