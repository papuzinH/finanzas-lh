'use client';

import { InfoHint } from '@/components/ui/info-hint';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency } from '@/lib/utils';

export function CurrencyExposureCard() {
  const getCurrencyExposure = useFinanceStore((s) => s.getCurrencyExposure);
  const { arsShare, usdShare, arsAmount, usdAmountOriginal, totalARS } = getCurrencyExposure();

  if (totalARS === 0) return null;

  return (
    <div className="rounded-2xl bg-surface border-[1.5px] border-border p-4">
      <h3 className="text-sm font-bold text-text mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5">
          Exposición de tu gasto
          <InfoHint label="Qué muestra">
            Qué parte de tu gasto es en pesos y qué parte está dolarizada (compras en USD),
            valuado en pesos de hoy.
          </InfoHint>
        </span>
        <span className="text-[9px] text-muted font-bold bg-surface-2 px-1.5 py-0.5 rounded">🇦🇷 AR</span>
      </h3>
      <div className="flex h-7 rounded-lg overflow-hidden border-[1.5px] border-border">
        <div className="bg-hero text-cream text-[10px] font-bold grid place-items-center" style={{ width: `${arsShare}%` }}>
          {arsShare.toFixed(0)}%
        </div>
        <div className="bg-good text-cream text-[10px] font-bold grid place-items-center" style={{ width: `${usdShare}%` }}>
          {usdShare > 12 ? `${usdShare.toFixed(0)}%` : ''}
        </div>
      </div>
      <div className="flex justify-between mt-2 text-[10px]">
        <span className="text-text"><b>{formatCurrency(arsAmount)}</b> en pesos</span>
        <span className="text-good"><b>USD {Math.round(usdAmountOriginal)}</b> dolarizado</span>
      </div>
    </div>
  );
}
