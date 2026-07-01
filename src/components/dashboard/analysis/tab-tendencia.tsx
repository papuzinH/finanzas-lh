'use client';

import { TrendChart } from '@/components/dashboard/trend-chart';
import { SavingsRateBars } from './charts/savings-rate-bars';
import { useFinanceStore } from '@/lib/store/financeStore';

export function TabTendencia() {
  const getRealAdjustedTrend = useFinanceStore((s) => s.getRealAdjustedTrend);
  const real = getRealAdjustedTrend(6);

  let realHint: string | null = null;
  if (real.available && real.rows.length >= 2) {
    const last = real.rows[real.rows.length - 1];
    const prev = real.rows[real.rows.length - 2];
    if (prev.realExpenses > 0) {
      const deltaReal = ((last.realExpenses - prev.realExpenses) / prev.realExpenses) * 100;
      realHint = deltaReal <= 0
        ? `En términos reales gastaste ${Math.abs(deltaReal).toFixed(0)}% menos que el mes pasado ✓`
        : `En términos reales gastaste ${deltaReal.toFixed(0)}% más que el mes pasado`;
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-surface border-[1.5px] border-border p-4">
        <h3 className="text-sm font-bold text-text mb-3">Ingreso vs Gasto · 6 meses</h3>
        <TrendChart />
        {realHint && (
          <p className="text-[11px] text-text font-semibold mt-2 bg-accent/8 rounded-lg px-3 py-1.5">
            📊 {realHint}
          </p>
        )}
      </div>
      <div className="rounded-2xl bg-surface border-[1.5px] border-border p-4">
        <h3 className="text-sm font-bold text-text mb-2">Tasa de ahorro mensual</h3>
        <SavingsRateBars />
      </div>
    </div>
  );
}
