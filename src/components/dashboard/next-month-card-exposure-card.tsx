'use client';

import { CalendarClock } from 'lucide-react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency } from '@/lib/utils';

export function NextMonthCardExposureCard() {
  const getNextMonthCardExposure = useFinanceStore((s) => s.getNextMonthCardExposure);
  const { nextCyclePurchases, futureInstallments, total } = getNextMonthCardExposure();

  if (total <= 0) return null;

  return (
    <div className="rounded-2xl bg-surface border-[1.5px] border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-text inline-flex items-center gap-1.5">
          <CalendarClock className="w-4 h-4 text-muted" />
          Consumo tarjeta próximo mes
        </h3>
      </div>

      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-muted">Ya comprometido</span>
        <span className="font-poster tnum text-2xl text-text">{formatCurrency(total)}</span>
      </div>

      <div className="mt-3 space-y-1.5">
        {nextCyclePurchases > 0 && (
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-muted">Compras del próximo cierre</span>
            <span className="font-poster tnum text-[13px] text-text/70">{formatCurrency(nextCyclePurchases)}</span>
          </div>
        )}
        {futureInstallments > 0 && (
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-muted">Cuotas futuras</span>
            <span className="font-poster tnum text-[13px] text-text/70">{formatCurrency(futureInstallments)}</span>
          </div>
        )}
      </div>

      <p className="mt-3 text-[11px] text-faint">
        No toca tu plata de hoy. Prepara el terreno para el mes que viene.
      </p>
    </div>
  );
}
