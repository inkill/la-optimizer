'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchStats } from '@/lib/api';
import { Layers, GitMerge, Package, Swords } from 'lucide-react';

export function StatsBar() {
  const { data } = useQuery({ queryKey: ['stats'], queryFn: fetchStats });

  const stats = [
    { icon: <Layers className="h-4 w-4" />, label: 'Cards', value: data?.totalCards ?? 0, color: 'text-violet-300' },
    { icon: <GitMerge className="h-4 w-4" />, label: 'Combinations', value: data?.totalCombos ?? 0, color: 'text-amber-300' },
    { icon: <Package className="h-4 w-4" />, label: 'In Library', value: data?.libraryCount ?? 0, color: 'text-emerald-300' },
    { icon: <Swords className="h-4 w-4" />, label: 'In Deck', value: data?.deckCount ?? 0, color: 'text-rose-300' },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="flex items-center gap-2.5 rounded-lg border bg-card/50 px-3 py-2 backdrop-blur">
          <span className={s.color}>{s.icon}</span>
          <div className="min-w-0">
            <div className="text-lg font-bold leading-none tabular-nums">{s.value.toLocaleString()}</div>
            <div className="truncate text-xs text-muted-foreground">{s.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
