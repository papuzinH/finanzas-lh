'use client';

import { useState } from 'react';
import { CategoryTreemap } from './charts/category-treemap';
import { FrequencyHeatmap } from './charts/frequency-heatmap';
import { CurrencyExposureCard } from './cards/currency-exposure-card';
import { Modal } from '@/components/shared/modal';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency } from '@/lib/utils';

export function TabCategorias() {
  const { getCategoryBreakdown, toDisplay } = useFinanceStore();
  const [selected, setSelected] = useState<string | null>(null);
  const breakdown = getCategoryBreakdown('current_month');
  const item = selected ? breakdown.items.find((i) => i.name === selected) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-surface border-[1.5px] border-border p-4">
        <h3 className="text-sm font-bold text-text mb-3">Distribución del gasto</h3>
        <CategoryTreemap onSelect={setSelected} />
      </div>
      <div className="rounded-2xl bg-surface border-[1.5px] border-border p-4">
        <h3 className="text-sm font-bold text-text mb-3">Frecuencia por categoría</h3>
        <FrequencyHeatmap />
      </div>
      <CurrencyExposureCard />

      <Modal isOpen={!!item} onClose={() => setSelected(null)} title={selected ?? ''}>
        {item && (
          <div className="text-center py-4">
            <p className="text-xs text-muted uppercase tracking-wider mb-1">Gasto del mes</p>
            <p className="font-poster tnum text-3xl text-text">{formatCurrency(toDisplay(item.value))}</p>
            <p className="text-sm text-muted mt-2">{item.percentage.toFixed(1)}% del total</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
