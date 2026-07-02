'use client';

import { useState } from 'react';
import { CategoryTreemap } from './charts/category-treemap';
import { FrequencyHeatmap } from './charts/frequency-heatmap';
import { CurrencyExposureCard } from './cards/currency-exposure-card';
import { InfoHint } from '@/components/ui/info-hint';
import { Modal } from '@/components/shared/modal';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency } from '@/lib/utils';

export function TabCategorias() {
  const { getCategoryBreakdown, toDisplay } = useFinanceStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [scope, setScope] = useState<'current_month' | 'global'>('current_month');
  const breakdown = getCategoryBreakdown(scope);
  const item = selected ? breakdown.items.find((i) => i.name === selected) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-surface border-[1.5px] border-border p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-bold text-text flex items-center gap-1.5">
            Distribución del gasto
            <InfoHint label="Qué muestra">
              Cuánto pesa cada categoría sobre tu gasto total. &laquo;Mes&raquo; usa el ciclo actual;
              &laquo;Histórico&raquo; suma todo. Tocá una categoría para ver el detalle.
            </InfoHint>
          </h3>
          <button
            onClick={() => setScope(scope === 'current_month' ? 'global' : 'current_month')}
            aria-label="Cambiar entre mes actual e histórico"
            className="shrink-0 rounded-full border-[1.5px] border-border bg-surface-2 px-3 py-2 text-[11px] font-bold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <span className={scope === 'current_month' ? 'text-accent' : 'text-muted'}>Mes</span>
            <span className="text-faint mx-1">·</span>
            <span className={scope === 'global' ? 'text-accent' : 'text-muted'}>Histórico</span>
          </button>
        </div>
        <CategoryTreemap key={scope} scope={scope} onSelect={setSelected} />
      </div>
      <div className="rounded-2xl bg-surface border-[1.5px] border-border p-4">
        <h3 className="text-sm font-bold text-text mb-3 flex items-center gap-1.5">
          Frecuencia por categoría
          <InfoHint label="Qué muestra">
            Cuántas veces gastaste en cada categoría en el período. Más intenso = más movimientos.
          </InfoHint>
        </h3>
        <FrequencyHeatmap />
      </div>
      <CurrencyExposureCard />

      <Modal isOpen={!!item} onClose={() => setSelected(null)} title={selected ?? ''}>
        {item && (
          <div className="text-center py-4">
            <p className="text-xs text-muted uppercase tracking-wider mb-1">{scope === 'global' ? 'Gasto histórico' : 'Gasto del mes'}</p>
            <p className="font-poster tnum text-3xl text-text">{formatCurrency(toDisplay(item.value))}</p>
            <p className="text-sm text-muted mt-2">{item.percentage.toFixed(1)}% del total</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
