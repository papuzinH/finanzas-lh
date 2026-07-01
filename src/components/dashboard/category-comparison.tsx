'use client';

import { useState } from 'react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { TrendingUp, ChevronRight } from 'lucide-react';
import { Modal } from '@/components/shared/modal';

function renderCategoryRow(
  item: { category: string; emoji: string; current: number; previous: number; change: number },
  maxVal: number
) {
  const isUp = item.change > 0;
  const changePercent =
    item.previous === 0 ? 100 : (Math.abs(item.change) / item.previous) * 100;
  const prevPct = (item.previous / maxVal) * 100;
  const currPct = (item.current / maxVal) * 100;

  return (
    <div key={item.category} className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-text">
          <span aria-hidden="true">{item.emoji}</span>
          <span className="truncate">{item.category}</span>
        </span>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
            isUp ? 'bg-bad/10 text-bad' : 'bg-good/10 text-good'
          )}
        >
          {isUp ? '+' : '-'}{changePercent.toFixed(0)}%
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-8 shrink-0 text-right text-[10px] text-muted">ant.</span>
        <div className="flex-1 overflow-hidden rounded-full bg-surface-2" style={{ height: '6px' }}>
          <div
            className="h-full rounded-full bg-border transition-all duration-500"
            style={{ width: `${prevPct}%` }}
          />
        </div>
        <span className="w-20 shrink-0 text-right font-poster tnum text-[10px] text-muted">
          {formatCurrency(item.previous)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-8 shrink-0 text-right text-[10px] text-muted">act.</span>
        <div className="flex-1 overflow-hidden rounded-full bg-surface-2" style={{ height: '6px' }}>
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              isUp ? 'bg-bad' : 'bg-good'
            )}
            style={{ width: `${currPct}%` }}
          />
        </div>
        <span className="w-20 shrink-0 text-right font-poster tnum text-[10px] text-text">
          {formatCurrency(item.current)}
        </span>
      </div>
    </div>
  );
}

export function CategoryComparison() {
  const getCategoryComparison = useFinanceStore((s) => s.getCategoryComparison);
  const data = getCategoryComparison();
  const [isOpen, setIsOpen] = useState(false);

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border-[1.5px] border-border bg-surface p-5">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-text">Variación por Categoría</h3>
        </div>
        <div className="flex h-40 items-center justify-center">
          <p className="text-center text-xs italic text-muted">
            Necesitás al menos 2 meses de datos
          </p>
        </div>
      </div>
    );
  }

  const top5 = data.slice(0, 5);
  const cardMaxVal = Math.max(...top5.flatMap((d) => [d.current, d.previous]), 1);
  const dialogMaxVal = Math.max(...data.flatMap((d) => [d.current, d.previous]), 1);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Ver detalle de variación por categoría"
        className={cn(
          'w-full text-left rounded-2xl border-[1.5px] border-border bg-surface p-5',
          'cursor-pointer hover:bg-surface-2/50 transition-all duration-200',
          'active:scale-[0.99]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50'
        )}
      >
        <div className="mb-5 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-text">Variación por Categoría</h3>
          <span className="ml-auto text-[10px] text-muted">Top 5 mayor cambio</span>
          <ChevronRight className="h-4 w-4 text-muted" aria-hidden="true" />
        </div>
        <div className="space-y-5">
          {top5.map((item) => renderCategoryRow(item, cardMaxVal))}
        </div>
      </button>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Variación por Categoría">
        <div className="space-y-5">
          <p className="text-xs text-muted -mt-1">
            {data.length} {data.length === 1 ? 'categoría' : 'categorías'} · mes actual vs. anterior
          </p>
          {data.map((item) => renderCategoryRow(item, dialogMaxVal))}
        </div>
      </Modal>
    </>
  );
}
