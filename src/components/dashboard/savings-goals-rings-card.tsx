'use client';

import { useFinanceStore } from '@/lib/store/financeStore';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';

const RING_SIZE = 80;
const STROKE_WIDTH = 8;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function SavingsGoalsRingsCard() {
  const getSavingsGoalsOverview = useFinanceStore((s) => s.getSavingsGoalsOverview);
  const overview = getSavingsGoalsOverview();

  if (overview.activeCount === 0) return null;

  const shownGoals = overview.goals.slice(0, 4);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap justify-around gap-3">
        {shownGoals.map((g) => {
          const ringColor = g.status === 'completed' ? 'var(--good)' : 'var(--accent)';
          const dash = (CIRCUMFERENCE * Math.min(g.percent, 100)) / 100;

          return (
            <div key={g.id} className="flex flex-col items-center w-[76px]">
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
                  <span className="tnum text-text text-[15px] font-bold">{Math.round(g.percent)}%</span>
                </div>
              </div>
              <span className="text-[11px] font-bold text-text truncate max-w-full mt-1">{g.name}</span>
              {g.currency === 'USD' && (
                <span className="text-[9px] bg-surface-2 text-muted px-1.5 py-0.5 rounded-full mt-0.5">USD</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-border pt-3 flex items-center justify-between">
        <span className="text-[11px] text-muted">Total ahorrado</span>
        <span className="font-poster tnum text-text text-[15px]">{formatCurrency(overview.totalSavedARS)}</span>
      </div>
    </Card>
  );
}
