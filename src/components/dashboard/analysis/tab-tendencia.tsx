'use client';

import { useState } from 'react';
import { TrendChart } from '@/components/dashboard/trend-chart';
import { QueSeMovio } from './charts/que-se-movio';
import { DetalleCategoria } from './charts/detalle-categoria';
import { SavingsRateBars } from './charts/savings-rate-bars';
import { InfoHint } from '@/components/ui/info-hint';
import { Modal } from '@/components/shared/modal';
import { useFinanceStore } from '@/lib/store/financeStore';
import { cn } from '@/lib/utils';
import type { Vara } from '@/lib/finance/historico';

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
  // El store entero, no sus getters sueltos (ver store-freshness.test.ts).
  const store = useFinanceStore();
  const real = store.getRealAdjustedTrend(6);
  const savingsSeries = store.getSavingsRateSeries(6);
  const hasSavingsData = savingsSeries.some((d) => d.net !== 0);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [categoriaDetalle, setCategoriaDetalle] = useState<string | null>(null);
  // Fix round 1 — Hallazgo 1: <QueSeMovio> tiene su propio toggle de vara; acá
  // sólo lo espejamos (no lo controlamos) para pasárselo a <DetalleCategoria>
  // y que el modal compare contra la misma referencia que la fila que lo abrió.
  const [varaDetalle, setVaraDetalle] = useState<Vara>('promedio');

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
      <QueSeMovio onSelect={setCategoriaDetalle} onVaraChange={setVaraDetalle} />
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
              {activeEntry.month} · <span className="tnum">{store.formatDisplay(activeEntry.net)}</span> netos
            </p>
          </>
        )}
        <SavingsRateBars selectedMonth={selectedMonth} onSelectMonth={setSelectedMonth} />
      </div>

      <Modal isOpen={!!categoriaDetalle} onClose={() => setCategoriaDetalle(null)} title="Cómo viene">
        {categoriaDetalle && <DetalleCategoria categoryId={categoriaDetalle} vara={varaDetalle} />}
      </Modal>
    </div>
  );
}
