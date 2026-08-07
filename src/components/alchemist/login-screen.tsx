'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { login } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FlaskConical, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export function LoginScreen() {
  const [name, setName] = useState('');
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: (n: string) => login(n),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['library'] });
      qc.invalidateQueries({ queryKey: ['decks'] });
      toast.success(data.isNew ? `Welcome, ${data.user.name}!` : `Welcome back, ${data.user.name}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    mut.mutate(name.trim());
  };

  return (
    <div className="alchemist-bg flex min-h-screen flex-col items-center justify-center px-4 text-foreground">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-amber-500 shadow-xl shadow-violet-500/40">
            <FlaskConical className="h-8 w-8 text-white" />
            <div className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 shadow">
              <Sparkles className="h-3.5 w-3.5 text-amber-950" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              Little Alchemist{' '}
              <span className="bg-gradient-to-r from-violet-300 to-amber-300 bg-clip-text text-transparent">
                Deck Optimizer
              </span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in with a name to manage your collection and decks
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name…"
            className="h-12 text-center text-lg"
            autoFocus
            maxLength={40}
          />
          <Button
            type="submit"
            className="h-12 w-full text-base"
            disabled={mut.isPending || !name.trim()}
          >
            {mut.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…
              </>
            ) : (
              'Sign In / Sign Up'
            )}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          New users get a starter library with all Common &amp; Uncommon cards
          plus 10 fused Rare cards.
        </p>
      </div>
    </div>
  );
}
