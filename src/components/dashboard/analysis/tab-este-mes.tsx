'use client';

import { SpendingPaceChart } from './charts/spending-pace-chart';
import { InstallmentsRealCostCard } from './cards/installments-real-cost-card';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency } from '@/lib/utils';

export function TabEsteMes() {
  const getMonthlySpendingPace = useFinanceStore((s) => s.getMonthlySpendingPace);
  const pace = getMonthlySpendingPace();
  const ok = pace.income === 0 ? null : pace.projectedTotal <= pace.income;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-surface border-[1.5px] border-border p-4">
        <h3 className="text-sm font-bold text-text mb-1">Ritmo de gasto</h3>
        <SpendingPaceChart />
        {pace.points.length > 0 && (
          <p className="text-[11px] text-warn font-semibold mt-2 bg-warn/10 rounded-lg px-3 py-1.5">
            A este ritmo terminás en ~{formatCurrency(pace.projectedTotal)}
            {ok !== null && (ok ? ' · vas OK ✓' : ' · ojo, te pasás del ingreso')}
          </p>
        )}
      </div>
      <InstallmentsRealCostCard />
    </div>
  );
}
