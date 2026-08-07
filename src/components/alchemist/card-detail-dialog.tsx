'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchCardDetail, addToLibrary, addToDeck } from '@/lib/api';
import type { Card } from '@/lib/types';
import { rarityFromCode } from '@/lib/rarity';
import { RarityBadge } from './rarity-badge';
import { CardImage } from './card-image';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Layers, Swords, Shield } from 'lucide-react';
import { toast } from 'sonner';

interface CardDetailDialogProps {
  card: Card | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CardDetailDialog({ card, open, onOpenChange }: CardDetailDialogProps) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['card-detail', card?.id],
    queryFn: () => fetchCardDetail(card!.id),
    enabled: !!card && open,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start gap-4">
            {card && <CardImage card={card} className="h-24 w-20 shrink-0" />}
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-2xl">
                {card?.name}
                {card && <RarityBadge rarity={card.rarity} />}
              </DialogTitle>
              <DialogDescription className="mt-1">
                Card #{card?.id} · {card?.comboCount} combinations involve this card
              </DialogDescription>
              {card && (
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => addLibMut.mutate(card.id)} disabled={addLibMut.isPending}>
                    <Plus className="h-4 w-4" /> Add to Library
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => addDeckMut.mutate(card.id)} disabled={addDeckMut.isPending}>
                    <Plus className="h-4 w-4" /> Add to Deck
                  </Button>
                </div>
              )}
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading combinations…
          </div>
        ) : data ? (
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Layers className="h-4 w-4 text-violet-400" />
              {data.combos.length} combinations
            </div>
            {data.combos.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">This card has no combinations.</p>
            ) : (
              <div className="max-h-[45vh] space-y-1.5 overflow-y-auto alchemist-scroll pr-1">
                {data.combos.map((c) => {
                  const rarity = rarityFromCode(c.resultRarity);
                  return (
                    <div key={c.id} className="flex flex-col gap-2 rounded-md border bg-card/40 p-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <CardImage card={c.partner} className="h-8 w-7" />
                        <span className="font-medium">{c.partner.name}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-medium">{c.resultName}</span>
                        <RarityBadge rarity={rarity} className="scale-90" />
                      </div>
                      <div className="flex gap-2 text-xs">
                        <span className="flex items-center gap-1 rounded bg-red-500/10 px-1.5 py-0.5 font-mono text-red-300">
                          <Swords className="h-3 w-3" />{c.ba0}/{c.ba1}/{c.ba2}
                        </span>
                        <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-emerald-300">
                          <Shield className="h-3 w-3" />{c.bd0}/{c.bd1}/{c.bd2}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
