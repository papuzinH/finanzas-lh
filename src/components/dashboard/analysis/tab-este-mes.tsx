'use client';

import { Check, AlertTriangle } from 'lucide-react';
import { SpendingPaceChart } from './charts/spending-pace-chart';
import { InstallmentsRealCostCard } from './cards/installments-real-cost-card';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency } from '@/lib/utils';

export function TabEsteMes() {
  const { getMonthlySpendingPace, toDisplay } = useFinanceStore();
  const pace = getMonthlySpendingPace();
  // pace.projectedTotal e pace.income vienen en ARS: la comparación queda en ARS crudo
  // (convertir ambos lados no cambiaría el resultado, y convertir uno solo lo rompería).
  const ok = pace.income === 0 ? null : pace.projectedTotal <= pace.income;
  const hasData = pace.points.length > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:items-start">
      <div className="rounded-2xl bg-surface border-[1.5px] border-border p-4">
        <h3 className="text-sm font-bold text-text mb-2">¿Llegás a fin de mes?</h3>

        {hasData && (
          <div className="flex items-center gap-2 mb-2">
            {ok !== null && (
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  ok ? 'bg-good/10 text-good' : 'bg-bad/10 text-bad'
                }`}
              >
                {ok ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                {ok ? 'Vas bien' : 'Te pasás'}
              </span>
            )}
            <span className="text-[11px] text-muted">
              Proyectás <b className="text-text tnum">{formatCurrency(toDisplay(pace.projectedTotal))}</b>
            </span>
          </div>
        )}

        <SpendingPaceChart />

        {hasData && (
          <div className="flex items-center gap-3 mt-2 text-[10px] text-muted">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: 'var(--text)' }} />
              Gasto
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: 'var(--warn)' }} />
              Proyección
            </span>
            {pace.income > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: 'var(--bad)' }} />
                Ingreso
              </span>
            )}
          </div>
        )}
      </div>
      <InstallmentsRealCostCard />
    </div>
  );
}
