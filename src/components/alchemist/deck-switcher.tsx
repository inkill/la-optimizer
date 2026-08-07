'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchDecks, createDeck, renameDeck, deleteDeck, activateDeck,
} from '@/lib/api';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Trash2, Pencil, Plus, Layers3, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function DeckSwitcher() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['decks'], queryFn: fetchDecks });
  const decks = data?.decks ?? [];
  const activeDeck = decks.find((d) => d.isActive) ?? decks[0];

  const [manageOpen, setManageOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const activateMut = useMutation({
    mutationFn: (id: string) => activateDeck(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['decks'] });
      qc.invalidateQueries({ queryKey: ['deck'] });
      qc.invalidateQueries({ queryKey: ['optimize'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: () => createDeck(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['decks'] });
      toast.success('Deck created');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renameMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameDeck(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['decks'] });
      setRenameId(null);
      toast.success('Deck renamed');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteDeck(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['decks'] });
      qc.invalidateQueries({ queryKey: ['deck'] });
      qc.invalidateQueries({ queryKey: ['optimize'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      toast.success('Deck deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex items-center gap-2">
      <Layers3 className="h-4 w-4 text-violet-300" />
      <Select
        value={activeDeck?.id}
        onValueChange={(v) => activateMut.mutate(v)}
      >
        <SelectTrigger className="h-9 w-[180px]">
          <SelectValue placeholder="Select deck" />
        </SelectTrigger>
        <SelectContent>
          {decks.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name} {d.isActive ? '✓' : ''} ({d.size ?? 0}/30)
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="outline"
        size="sm"
        className="h-9"
        onClick={() => setManageOpen(true)}
      >
        Manage
      </Button>

      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9"
        onClick={() => createMut.mutate()}
        disabled={decks.length >= 10 || createMut.isPending}
        title="Create new deck"
      >
        <Plus className="h-4 w-4" />
      </Button>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Decks ({decks.length}/10)</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {decks.map((d) => (
              <div
                key={d.id}
                className={cn(
                  'flex items-center gap-2 rounded-md border p-2',
                  d.isActive && 'border-violet-400/60 bg-violet-500/5'
                )}
              >
                {renameId === d.id ? (
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className="h-8"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && renameValue.trim()) {
                        renameMut.mutate({ id: d.id, name: renameValue.trim() });
                      }
                      if (e.key === 'Escape') setRenameId(null);
                    }}
                  />
                ) : (
                  <span className="flex-1 truncate text-sm font-medium">
                    {d.name}{' '}
                    <span className="text-xs text-muted-foreground">
                      ({d.size ?? 0}/30)
                    </span>
                    {d.isActive && (
                      <Check className="ml-1 inline h-3.5 w-3.5 text-emerald-400" />
                    )}
                  </span>
                )}

                {renameId === d.id ? (
                  <Button
                    size="sm" className="h-8"
                    onClick={() => renameValue.trim() && renameMut.mutate({ id: d.id, name: renameValue.trim() })}
                  >
                    Save
                  </Button>
                ) : (
                  <>
                    {!d.isActive && (
                      <Button
                        size="sm" variant="ghost" className="h-8"
                        onClick={() => activateMut.mutate(d.id)}
                      >
                        Activate
                      </Button>
                    )}
                    <Button
                      size="icon" variant="ghost" className="h-8 w-8"
                      onClick={() => { setRenameId(d.id); setRenameValue(d.name); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon" variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteMut.mutate(d.id)}
                      disabled={decks.length <= 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => createMut.mutate()}
              disabled={decks.length >= 10}
            >
              <Plus className="h-4 w-4" /> New Deck
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
