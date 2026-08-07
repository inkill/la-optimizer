'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { register, logout, guestLogin, getStoredUserId, setStoredUserId, clearStoredUserId } from '@/lib/api';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User as UserIcon, Loader2, LogOut, UserCheck, Info } from 'lucide-react';
import type { User } from '@/lib/types';
import { toast } from 'sonner';

interface AccountMenuProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AccountMenu({ user, open, onOpenChange }: AccountMenuProps) {
  const [name, setName] = useState('');
  const qc = useQueryClient();
  const isGuest = user.name.startsWith('Guest-');

  const registerMut = useMutation({
    mutationFn: (n: string) => register(n),
    onSuccess: (data) => {
      // Update the stored user ID (in case we switched accounts)
      setStoredUserId(data.user.id);
      qc.setQueryData(['me'], data.user);
      qc.invalidateQueries({ queryKey: ['library'] });
      qc.invalidateQueries({ queryKey: ['decks'] });
      qc.invalidateQueries({ queryKey: ['deck'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['optimize'] });
      if (data.switched) {
        toast.success(`Switched to account "${data.user.name}". Library and decks loaded.`);
      } else {
        toast.success(`Account saved as "${data.user.name}". Your progress is now backed up.`);
      }
      onOpenChange(false);
      setName('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const logoutMut = useMutation({
    mutationFn: () => logout(),
    onSuccess: async () => {
      // Clear the stored user ID, then create a new guest session.
      clearStoredUserId();
      qc.setQueryData(['me'], null);
      try {
        const guest = await guestLogin();
        qc.setQueryData(['me'], guest.user);
        qc.invalidateQueries({ queryKey: ['library'] });
        qc.invalidateQueries({ queryKey: ['decks'] });
        qc.invalidateQueries({ queryKey: ['deck'] });
        qc.invalidateQueries({ queryKey: ['stats'] });
        qc.invalidateQueries({ queryKey: ['optimize'] });
        toast.success('Signed out. A new guest session started.');
      } catch (e) {
        toast.error('Signed out, but failed to create new guest session.');
      }
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    registerMut.mutate(name.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserIcon className="h-5 w-5 text-violet-400" />
            Account
          </DialogTitle>
          <DialogDescription>
            {isGuest
              ? 'You are using a guest account. Save your progress by registering a name.'
              : 'Manage your account.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current account info */}
          <div className="rounded-lg border bg-card/50 p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-amber-400 text-sm font-bold text-white">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="font-medium">{user.name}</div>
                <div className="text-xs text-muted-foreground">
                  {isGuest ? 'Guest account — not backed up' : 'Registered account'}
                </div>
              </div>
            </div>
          </div>

          {isGuest && (
            <>
              <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-xs text-amber-200">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Guest accounts are stored on this device only. Register a name to back up your
                  collection and decks — you can then sign in from any device.
                </p>
              </div>

              <form onSubmit={submit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="account-name">Choose a name</Label>
                  <Input
                    id="account-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. AlchemistMaster"
                    maxLength={40}
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={registerMut.isPending || !name.trim()}
                >
                  {registerMut.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>
                  ) : (
                    <><UserCheck className="mr-2 h-4 w-4" /> Save Account</>
                  )}
                </Button>
              </form>
            </>
          )}

          <DialogFooter className="border-t pt-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => logoutMut.mutate()}
              disabled={logoutMut.isPending}
            >
              {logoutMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="mr-2 h-4 w-4" />
              )}
              Sign Out
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
