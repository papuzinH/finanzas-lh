'use client';

import { useFinanceStore } from '@/lib/store/financeStore';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';

// Card compacta: vive lado a lado con BudgetGaugeCard en una grilla de 2
// columnas (ver page.tsx), asi que solo entran 2 anillos por fila en una
// columna angosta (~170px con Card p-3); el resto queda resumido en "+N".
const RING_SIZE = 56;
const STROKE_WIDTH = 6;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const MAX_SHOWN = 2;

export function SavingsGoalsRingsCard() {
  const getSavingsGoalsOverview = useFinanceStore((s) => s.getSavingsGoalsOverview);
  const overview = getSavingsGoalsOverview();

  if (overview.activeCount === 0) return null;

  const shownGoals = overview.goals.slice(0, MAX_SHOWN);
  const remaining = overview.activeCount - shownGoals.length;

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-center gap-2">
        {shownGoals.map((g) => {
          const ringColor = g.status === 'completed' ? 'var(--good)' : 'var(--accent)';
          const dash = (CIRCUMFERENCE * Math.min(g.percent, 100)) / 100;

          return (
            <div key={g.id} className="flex flex-col items-center w-1/2 min-w-0">
              <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
                <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
                  <circle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    stroke="var(--surface-2)"
                    strokeWidth={STROKE_WIDTH}
                  />
                  <circle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    stroke={ringColor}
                    strokeWidth={STROKE_WIDTH}
                    strokeLinecap="round"
                    strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
                    transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="tnum text-text text-[11px] font-bold">{Math.round(g.percent)}%</span>
                </div>
              </div>
              <span className="text-[9px] font-bold text-text truncate max-w-full mt-1">{g.name}</span>
            </div>
          );
        })}
      </div>

      {remaining > 0 && (
        <p className="text-center text-[9px] text-muted">
          +{remaining} meta{remaining > 1 ? 's' : ''} más
        </p>
      )}

      <div className="border-t border-border pt-2 text-center">
        <p className="text-[9px] text-muted">Ahorrado</p>
        <p className="font-poster tnum text-text text-[13px] leading-tight">
          {formatCurrency(overview.totalSavedARS)}
        </p>
      </div>
    </Card>
  );
}
