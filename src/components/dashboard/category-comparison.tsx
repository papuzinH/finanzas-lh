'use client';

import { useState } from 'react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { TrendingUp, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-slate-200">
          <span aria-hidden="true">{item.emoji}</span>
          <span className="truncate">{item.category}</span>
        </span>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
            isUp ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'
          )}
        >
          {isUp ? '+' : '-'}{changePercent.toFixed(0)}%
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-8 shrink-0 text-right text-[10px] text-slate-500">ant.</span>
        <div className="flex-1 overflow-hidden rounded-full bg-slate-800" style={{ height: '6px' }}>
          <div
            className="h-full rounded-full bg-slate-600 transition-all duration-500"
            style={{ width: `${prevPct}%` }}
          />
        </div>
        <span className="w-20 shrink-0 text-right font-mono text-[10px] text-slate-400 tabular-nums">
          {formatCurrency(item.previous)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-8 shrink-0 text-right text-[10px] text-slate-500">act.</span>
        <div className="flex-1 overflow-hidden rounded-full bg-slate-800" style={{ height: '6px' }}>
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              isUp ? 'bg-rose-500' : 'bg-emerald-500'
            )}
            style={{ width: `${currPct}%` }}
          />
        </div>
        <span className="w-20 shrink-0 text-right font-mono text-[10px] text-slate-300 tabular-nums">
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
      <div className="rounded-2xl border border-slate-800 bg-surface-raised/30 p-5">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-slate-500" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-slate-200">Variación por Categoría</h3>
        </div>
        <div className="flex h-40 items-center justify-center">
          <p className="text-center text-xs italic text-slate-500">
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
          'w-full text-left rounded-2xl border border-slate-800 bg-surface-raised/30 p-5',
          'cursor-pointer hover:border-slate-700 transition-all duration-200',
          'active:scale-[0.99]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
          'focus-visible:ring-offset-2 focus-visible:ring-offset-surface'
        )}
      >
        <div className="mb-5 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-slate-500" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-slate-200">Variación por Categoría</h3>
          <span className="ml-auto text-[10px] text-slate-500">Top 5 mayor cambio</span>
          <ChevronRight className="h-4 w-4 text-slate-600" aria-hidden="true" />
        </div>
        <div className="space-y-5">
          {top5.map((item) => renderCategoryRow(item, cardMaxVal))}
        </div>
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0 sm:max-w-[500px] bg-surface-overlay border-slate-800 text-slate-50">
          <DialogHeader className="p-6 pb-4 shrink-0 border-b border-slate-800/50">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
                <TrendingUp className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-white">
                  Variación por Categoría
                </DialogTitle>
                <p className="text-xs text-slate-400 mt-0.5">
                  {data.length} {data.length === 1 ? 'categoría' : 'categorías'} · mes actual vs. anterior
                </p>
              </div>
            </div>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 p-6 space-y-5">
            {data.map((item) => renderCategoryRow(item, dialogMaxVal))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
