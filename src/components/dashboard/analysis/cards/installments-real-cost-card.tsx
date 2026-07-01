'use client';

import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency } from '@/lib/utils';

export function InstallmentsRealCostCard() {
  const getInstallmentsRealCost = useFinanceStore((s) => s.getInstallmentsRealCost);
  const { remainingARS, remainingUSD, hasData } = getInstallmentsRealCost();

  if (!hasData) return null;

  return (
    <div className="rounded-2xl bg-surface border-[1.5px] border-warn/40 p-4">
      <h3 className="text-sm font-bold text-text mb-2 flex items-center justify-between">
        Costo real de tus cuotas
        <span className="text-[9px] text-warn font-bold bg-warn/10 px-1.5 py-0.5 rounded">🇦🇷 AR</span>
      </h3>
      <div className="flex items-baseline justify-between">
        <span className="font-poster tnum text-xl text-text">{formatCurrency(remainingARS)}</span>
        <span className="font-poster tnum text-sm text-good">USD {Math.round(remainingUSD)}</span>
      </div>
      <p className="text-[11px] text-muted mt-2 leading-relaxed">
        Te queda en cuotas · hoy valen <b className="text-good">USD {Math.round(remainingUSD)}</b>. La inflación licúa esta deuda mes a mes 👍
      </p>
    </div>
  );
}
