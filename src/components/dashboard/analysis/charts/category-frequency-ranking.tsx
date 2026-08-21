'use client';

import { useFinanceStore } from '@/lib/store/financeStore';

interface CategoryFrequencyRankingProps {
  scope: 'global' | 'current_month';
  onSelect: (category: string) => void;
}

export function CategoryFrequencyRanking({ scope, onSelect }: CategoryFrequencyRankingProps) {
  // El store entero, no el getter suelto (ver store-freshness.test.ts).
  const store = useFinanceStore();
  const rows = store.getCategoryFrequencyRanking(scope).slice(0, 6);

  if (rows.length === 0) {
    return (
      <div className="h-24 flex items-center justify-center text-xs text-muted italic">
        Sin datos de frecuencia
      </div>
    );
  }

  const maxCount = Math.max(...rows.map((r) => r.count), 1);

  return (
    <ul className="space-y-1">
      {rows.map((row) => (
        <li key={row.category}>
          <button
            type="button"
            onClick={() => onSelect(row.category)}
            aria-label={`${row.category}, ${row.count} movimientos, ver detalle`}
            className="w-full flex items-center gap-3 py-2 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <span className="w-[92px] shrink-0 text-xs text-text truncate">
              {row.emoji} {row.category}
            </span>
            <span className="flex-1 h-2.5 rounded-full bg-surface-2 overflow-hidden">
              <span
                className="block h-full rounded-full bg-accent"
                style={{ width: `${(row.count / maxCount) * 100}%` }}
              />
            </span>
            <span className="w-9 shrink-0 text-right text-sm font-bold text-text tnum">
              {row.count}x
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
