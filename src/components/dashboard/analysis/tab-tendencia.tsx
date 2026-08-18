'use client';

import { useState } from 'react';
import { TrendChart } from '@/components/dashboard/trend-chart';
import { SavingsRateBars } from './charts/savings-rate-bars';
import { InfoHint } from '@/components/ui/info-hint';
import { useFinanceStore } from '@/lib/store/financeStore';
import { cn, formatCurrency } from '@/lib/utils';

const TONE_LABEL: Record<'good' | 'warn' | 'bad', string> = {
  good: 'Sólido',
  warn: 'Ajustado',
  bad: 'Números rojos',
};

const TONE_CLASS: Record<'good' | 'warn' | 'bad', string> = {
  good: 'text-good bg-good/10',
  warn: 'text-warn bg-warn/10',
  bad: 'text-bad bg-bad/10',
};

export function TabTendencia() {
  const getRealAdjustedTrend = useFinanceStore((s) => s.getRealAdjustedTrend);
  const getSavingsRateSeries = useFinanceStore((s) => s.getSavingsRateSeries);
  const real = getRealAdjustedTrend(6);
  const savingsSeries = getSavingsRateSeries(6);
  const hasSavingsData = savingsSeries.some((d) => d.net !== 0);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

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

  const activeEntry = selectedMonth
    ? savingsSeries.find((s) => s.month === selectedMonth) ?? savingsSeries[savingsSeries.length - 1]
    : savingsSeries[savingsSeries.length - 1];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-surface border-[1.5px] border-border p-4">
        <h3 className="text-sm font-bold text-text mb-3 flex items-center gap-1.5">
          Ingreso vs Gasto · 6 meses
          <InfoHint label="Qué muestra">
            Compara tus ingresos y gastos de los últimos 6 meses. El texto de abajo ajusta el gasto
            por inflación, para verlo en términos reales.
          </InfoHint>
        </h3>
        <TrendChart />
        {realHint && (
          <p className="text-[11px] text-text font-semibold mt-2 bg-accent/8 rounded-lg px-3 py-1.5">
            📊 {realHint}
          </p>
        )}
      </div>
      <div className="rounded-2xl bg-surface border-[1.5px] border-border p-4">
        <h3 className="text-sm font-bold text-text mb-2 flex items-center gap-1.5">
          Tasa de ahorro mensual
          <InfoHint label="Qué muestra">
            Qué % de tu ingreso te queda como ahorro cada mes (neto ÷ ingreso). Tocá una barra para
            ver ese mes.
          </InfoHint>
        </h3>
        {hasSavingsData && activeEntry && (
          <>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-display tnum text-3xl text-text">{Math.round(activeEntry.rate)}%</span>
              <span className={cn('text-[10px] font-bold px-2 py-1 rounded-full', TONE_CLASS[activeEntry.tone])}>
                {TONE_LABEL[activeEntry.tone]}
              </span>
            </div>
            <p className="text-[11px] text-muted mb-3">
              {activeEntry.month} · <span className="tnum">{formatCurrency(activeEntry.net)}</span> netos
            </p>
          </>
        )}
        <SavingsRateBars selectedMonth={selectedMonth} onSelectMonth={setSelectedMonth} />
      </div>
    </div>
  );
}
