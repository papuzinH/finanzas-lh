'use client';

import { TrendingDown } from 'lucide-react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency } from '@/lib/utils';

export function InstallmentsRealCostCard() {
  const getInstallmentsRealCost = useFinanceStore((s) => s.getInstallmentsRealCost);
  const { remainingARS, remainingUSD, hasData } = getInstallmentsRealCost();

  if (!hasData) return null;

  return (
    <div className="rounded-2xl bg-surface border-[1.5px] border-warn/40 p-4">
      <h3 className="text-sm font-bold text-text mb-3 flex items-center justify-between">
        La inflación licúa tus cuotas
        <span className="text-[9px] text-warn font-bold bg-warn/10 px-1.5 py-0.5 rounded">🇦🇷 AR</span>
      </h3>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-muted">Debés</span>
        <span className="font-poster tnum text-xl text-text">{formatCurrency(remainingARS)}</span>
      </div>
      <div className="flex items-baseline justify-between mt-1">
        <span className="text-[11px] text-muted">Hoy valen</span>
        <span className="font-poster tnum text-sm text-good inline-flex items-center gap-1">
          USD {Math.round(remainingUSD)}
          <TrendingDown className="w-3.5 h-3.5" />
        </span>
      </div>
    </div>
  );
}
