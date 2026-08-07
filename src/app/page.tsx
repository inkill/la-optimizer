'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchMe, guestLogin, getStoredUserId } from '@/lib/api';
import type { Card } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { StatsBar } from '@/components/alchemist/stats-bar';
import { LibraryTab } from '@/components/alchemist/library-tab';
import { CombinationsTab } from '@/components/alchemist/combinations-tab';
import { CollectionTab } from '@/components/alchemist/collection-tab';
import { DeckBuilderTab } from '@/components/alchemist/deck-builder-tab';
import { OptimizerTab } from '@/components/alchemist/optimizer-tab';
import { CardDetailDialog } from '@/components/alchemist/card-detail-dialog';
import { AccountMenu } from '@/components/alchemist/account-menu';
import { FlaskConical, Sparkles, Loader2, UserCircle, LogIn } from 'lucide-react';

export default function Home() {
  const qc = useQueryClient();
  // Check localStorage once on first render.
  const [hasStoredUser] = useState(() => !!getStoredUserId());

  const { data: user, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    enabled: hasStoredUser,
  });

  const guestMut = useMutation({
    mutationFn: () => guestLogin(),
    onSuccess: (data) => {
      qc.setQueryData(['me'], data.user);
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['library'] });
      qc.invalidateQueries({ queryKey: ['decks'] });
    },
  });

  useEffect(() => {
    // If we have a stored user ID, the /me query handles validation.
    // Otherwise, auto-create a guest session. The mutation's `isIdle` state
    // prevents double-calls: once mutate() is called, isIdle becomes false.
    if (!hasStoredUser && guestMut.isIdle) {
      guestMut.mutate();
    }
     
  }, [hasStoredUser]);

  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const openCardDetail = (card: Card) => {
    setSelectedCard(card);
    setDetailOpen(true);
  };

  // Loading states:
  // - If we have a stored user and the /me query is loading → spinner
  // - If we don't have a stored user and the guest mutation is idle or pending → spinner
  const waitingForStoredUser = hasStoredUser && isLoading && !user;
  const waitingForGuest = !hasStoredUser && !user && (guestMut.isIdle || guestMut.isPending);

  if (waitingForStoredUser || waitingForGuest) {
    return (
      <div className="alchemist-bg flex min-h-screen flex-col items-center justify-center text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-amber-500 shadow-lg shadow-violet-500/30">
            <FlaskConical className="h-6 w-6 text-white" />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Preparing your alchemist lab…
          </div>
        </div>
      </div>
    );
  }

  // If guest creation failed, show a retry screen.
  if (!user && guestMut.isError) {
    return (
      <div className="alchemist-bg flex min-h-screen flex-col items-center justify-center px-4 text-foreground">
        <div className="flex flex-col items-center gap-4 text-center">
          <FlaskConical className="h-10 w-10 text-violet-400" />
          <p className="text-sm text-muted-foreground">Failed to start session.</p>
          <Button onClick={() => guestMut.mutate()} disabled={guestMut.isPending}>
            {guestMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const isGuest = user.name.startsWith('Guest-');

  return (
    <div className="alchemist-bg flex min-h-screen flex-col text-foreground">
      {/* Header */}
      <header className="border-b border-border/60 bg-card/30 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-amber-500 shadow-lg shadow-violet-500/30">
                <FlaskConical className="h-5 w-5 text-white" />
                <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-amber-950">
                  <Sparkles className="h-2.5 w-2.5" />
                </div>
              </div>
              <div>
                <h1 className="text-lg font-bold leading-tight sm:text-xl">
                  Little Alchemist{' '}
                  <span className="bg-gradient-to-r from-violet-300 to-amber-300 bg-clip-text text-transparent">
                    Deck Optimizer
                  </span>
                </h1>
                <p className="text-xs text-muted-foreground">
                  Calculator by Mr. Andersam · v4.01.83a
                </p>
              </div>
            </div>

            {/* Account button */}
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2"
              onClick={() => setAccountOpen(true)}
            >
              {isGuest ? (
                <LogIn className="h-4 w-4 text-amber-400" />
              ) : (
                <UserCircle className="h-4 w-4 text-violet-300" />
              )}
              <span className="max-w-[120px] truncate">{isGuest ? 'Sign In' : user.name}</span>
            </Button>
          </div>

          <div className="mt-3">
            <StatsBar />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <Tabs defaultValue="optimizer" className="w-full">
          <TabsList className="mb-5 grid h-auto w-full grid-cols-2 gap-1 rounded-lg bg-card/40 p-1 sm:grid-cols-5">
            <TabsTrigger value="optimizer" className="py-2">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Optimizer
            </TabsTrigger>
            <TabsTrigger value="library" className="py-2">Library</TabsTrigger>
            <TabsTrigger value="combinations" className="py-2">Combinations</TabsTrigger>
            <TabsTrigger value="collection" className="py-2">Collection</TabsTrigger>
            <TabsTrigger value="deck" className="py-2">Deck Builder</TabsTrigger>
          </TabsList>

          <TabsContent value="optimizer" className="mt-0 alchemist-fade-in">
            <OptimizerTab />
          </TabsContent>
          <TabsContent value="library" className="mt-0 alchemist-fade-in">
            <LibraryTab onSelectCard={openCardDetail} />
          </TabsContent>
          <TabsContent value="combinations" className="mt-0 alchemist-fade-in">
            <CombinationsTab />
          </TabsContent>
          <TabsContent value="collection" className="mt-0 alchemist-fade-in">
            <CollectionTab />
          </TabsContent>
          <TabsContent value="deck" className="mt-0 alchemist-fade-in">
            <DeckBuilderTab />
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-border/60 bg-card/30 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-1.5">
            <FlaskConical className="h-3.5 w-3.5 text-violet-400" />
            <span>278 cards · 8,824 combinations · Card images from lil-alchemist.fandom.com</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Excel calculator by <span className="font-medium text-foreground">Mr. Andersam</span></span>
            <span className="text-border">·</span>
            <span>Site by <span className="font-medium text-foreground">inkill</span></span>
          </div>
        </div>
      </footer>

      <CardDetailDialog card={selectedCard} open={detailOpen} onOpenChange={setDetailOpen} />
      <AccountMenu user={user} open={accountOpen} onOpenChange={setAccountOpen} />
    </div>
  );
}
