'use client';

import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';

interface FusedCheckboxesProps {
  quantity: number; // 1-3
  fused1: boolean;
  fused2: boolean;
  fused3: boolean;
  onChange: (fused: { fused1?: boolean; fused2?: boolean; fused3?: boolean }) => void;
  size?: 'sm' | 'md';
}

// Three checkboxes representing the fused state of each of the up-to-3 copies
// of a card. Copy N is only interactive when quantity >= N; otherwise its
// checkbox is disabled and dimmed.
export function FusedCheckboxes({
  quantity,
  fused1,
  fused2,
  fused3,
  onChange,
  size = 'sm',
}: FusedCheckboxesProps) {
  const copies = [
    { n: 1, fused: fused1, enabled: quantity >= 1 },
    { n: 2, fused: fused2, enabled: quantity >= 2 },
    { n: 3, fused: fused3, enabled: quantity >= 3 },
  ];

  const boxSize = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';

  return (
    <div className="flex items-center gap-1">
      <Sparkles className={cn('mr-0.5 text-amber-400', size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
      {copies.map((c) => (
        <button
          key={c.n}
          type="button"
          disabled={!c.enabled}
          onClick={() => onChange({ [`fused${c.n}`]: !c.fused })}
          className={cn(
            'flex items-center justify-center rounded border text-xs font-bold transition-colors',
            boxSize,
            c.enabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-30',
            c.fused
              ? 'border-amber-400 bg-amber-400 text-amber-950'
              : 'border-muted-foreground/40 bg-transparent text-muted-foreground hover:border-amber-400/60'
          )}
          aria-label={`Copy ${c.n} fused`}
          aria-pressed={c.fused}
          title={`Copy ${c.n}${c.enabled ? '' : ' (not owned)'}${c.fused ? ' — fused' : ''}`}
        >
          {c.n}
        </button>
      ))}
    </div>
  );
}
