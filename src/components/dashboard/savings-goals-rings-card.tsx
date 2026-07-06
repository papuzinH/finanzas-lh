'use client';

import { useFinanceStore } from '@/lib/store/financeStore';
import { Card } from '@/components/ui/card';
import { formatCurrency, formatUsd } from '@/lib/utils';

// Coordenadas "canonicas" del anillo: el SVG se dibuja en este viewBox fijo
// (0 0 80 80) y el contenedor lo escala fluido via clases responsive (w-14
// en mobile, md:w-20 en desktop) sin recalcular la geometria por breakpoint.
const RING_VIEWBOX = 80;
const STROKE_WIDTH = 8;
const RADIUS = (RING_VIEWBOX - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const MAX_SHOWN = 4;

export function SavingsGoalsRingsCard() {
  const getSavingsGoalsOverview = useFinanceStore((s) => s.getSavingsGoalsOverview);
  const overview = getSavingsGoalsOverview();

  if (overview.activeCount === 0) return null;

  const shownGoals = overview.goals.slice(0, MAX_SHOWN);
  const totalText =
    overview.totalDisplay.currency === 'USD'
      ? formatUsd(overview.totalDisplay.amount)
      : formatCurrency(overview.totalDisplay.amount);

  return (
    <Card className="p-3 md:p-5 flex flex-col">
      {/* Los anillos ocupan todo el espacio libre entre el top de la card y
          la fila de total, centrados verticalmente en ese espacio; la fila
          de total siempre queda pegada al fondo (flex-1 empuja hacia abajo). */}
      <div className="flex-1 flex items-center py-1">
        <div className="w-full flex flex-wrap justify-center md:justify-around gap-2 md:gap-4">
          {shownGoals.map((g) => {
            const ringColor = g.status === 'completed' ? 'var(--good)' : 'var(--accent)';
            const dash = (CIRCUMFERENCE * Math.min(g.percent, 100)) / 100;

            return (
              <div key={g.id} className="flex flex-col items-center w-[64px] md:w-[84px]">
                <div className="relative w-14 h-14 md:w-20 md:h-20">
                  <svg viewBox={`0 0 ${RING_VIEWBOX} ${RING_VIEWBOX}`} className="w-full h-full">
                    <circle
                      cx={RING_VIEWBOX / 2}
                      cy={RING_VIEWBOX / 2}
                      r={RADIUS}
                      fill="none"
                      stroke="var(--surface-2)"
                      strokeWidth={STROKE_WIDTH}
                    />
                    <circle
                      cx={RING_VIEWBOX / 2}
                      cy={RING_VIEWBOX / 2}
                      r={RADIUS}
                      fill="none"
                      stroke={ringColor}
                      strokeWidth={STROKE_WIDTH}
                      strokeLinecap="round"
                      strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
                      transform={`rotate(-90 ${RING_VIEWBOX / 2} ${RING_VIEWBOX / 2})`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="tnum text-text text-[11px] md:text-[16px] font-bold">
                      {Math.round(g.percent)}%
                    </span>
                  </div>
                </div>
                <span className="text-[9px] md:text-[12px] font-bold text-text truncate max-w-full mt-1">
                  {g.name}
                </span>
                {g.currency === 'USD' && (
                  <span className="hidden md:inline-block text-[9px] bg-surface-2 text-muted px-1.5 py-0.5 rounded-full mt-0.5">
                    USD
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-border pt-2 md:pt-3 flex items-center justify-between shrink-0">
        <span className="text-[9px] md:text-[12px] text-muted">Total ahorrado</span>
        <span className="font-poster tnum text-text text-[13px] md:text-[17px]">
          {totalText}
        </span>
      </div>
    </Card>
  );
}
