'use client';

import { useState } from 'react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { InfoHint } from '@/components/ui/info-hint';

type Tone = 'good' | 'warn' | 'bad';
type HoverTarget = 'current' | 'projected' | null;

const ARC_STROKE: Record<Tone, string> = {
  good: 'var(--good)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
};

const TEXT_TONE: Record<Tone, string> = {
  good: 'text-good',
  warn: 'text-warn',
  bad: 'text-bad',
};

const PILL_TONE: Record<Tone, string> = {
  good: 'bg-good/10 text-good',
  warn: 'bg-warn/10 text-warn',
  bad: 'bg-bad/10 text-bad',
};

// Coordenadas "canonicas" del gauge: el SVG se dibuja en este viewBox fijo y
// despues escala fluido con el contenedor (ver className w-full + aspect-[]
// mas abajo), asi que el mismo path/arco sirve para la columna angosta de
// mobile y para el ancho real que le toque en desktop.
const GAUGE_WIDTH = 220;
const GAUGE_HEIGHT = 128;
const RADIUS = 94;
const CENTER_X = GAUGE_WIDTH / 2;
const CENTER_Y = 116;
const STROKE_WIDTH = 16;
const ARC_LENGTH = Math.PI * RADIUS;
const ARC_PATH = `M ${CENTER_X - RADIUS} ${CENTER_Y} A ${RADIUS} ${RADIUS} 0 0 1 ${CENTER_X + RADIUS} ${CENTER_Y}`;

function pointOnArc(fraction: number) {
  const angle = Math.PI * (1 - fraction);
  return {
    x: CENTER_X + RADIUS * Math.cos(angle),
    y: CENTER_Y - RADIUS * Math.sin(angle),
  };
}

export function BudgetGaugeCard() {
  const getBudgetsOverview = useFinanceStore((s) => s.getBudgetsOverview);
  const getAllBudgetStatuses = useFinanceStore((s) => s.getAllBudgetStatuses);
  const [hover, setHover] = useState<HoverTarget>(null);

  const overview = getBudgetsOverview();
  if (!overview) return null;

  const { percent, projectedPercent, status, willExceed } = overview;
  const tone: Tone = status === 'exceeded' ? 'bad' : status === 'warning' ? 'warn' : 'good';
  const valueFraction = Math.min(percent, 100) / 100;
  const projectionPoint = pointOnArc(Math.min(projectedPercent, 100) / 100);
  // El punto de proyeccion nunca usa "good": si usara el mismo verde que el
  // arco cuando todo esta en orden, quedarian indistinguibles. "accent" marca
  // "esto es una proyeccion", no un estado — solo pasa a "bad" si te vas a pasar.
  const dotColor = willExceed ? 'var(--bad)' : 'var(--accent)';

  const pillTone: Tone = willExceed ? 'bad' : projectedPercent >= 90 ? 'warn' : 'good';
  const roundedProjected = Math.round(projectedPercent);
  const pillLabel = willExceed ? 'te pasás' : pillTone === 'warn' ? 'ajustado' : 'alcanza';

  const topBudgets = getAllBudgetStatuses().slice(0, 4);

  return (
    <Card className="relative p-3 md:p-5 space-y-2 md:space-y-4">
      <div className="absolute top-2 right-2 md:top-3 md:right-3">
        <InfoHint label="Cómo se calcula la proyección" align="end">
          Proyectamos tu gasto de fin de mes según el ritmo diario de tus presupuestos activos
          y lo comparamos contra el tope total.
        </InfoHint>
      </div>

      <div className="relative mx-auto w-full max-w-[160px] md:max-w-[240px] aspect-[220/128]">
        {hover && (
          <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-[calc(100%+4px)] whitespace-nowrap rounded-lg border-[1.5px] border-border bg-surface px-2.5 py-1 shadow-card">
            <span className="text-[10px] md:text-[11px] text-text">
              {hover === 'current' ? 'Gastado' : 'Proyección'}:{' '}
              <b className="tnum">{Math.round(hover === 'current' ? percent : projectedPercent)}%</b>
            </span>
          </div>
        )}
        <svg viewBox={`0 0 ${GAUGE_WIDTH} ${GAUGE_HEIGHT}`} className="w-full h-full overflow-visible">
          <path d={ARC_PATH} fill="none" stroke="var(--surface-2)" strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
          <path
            d={ARC_PATH}
            fill="none"
            stroke={ARC_STROKE[tone]}
            strokeWidth={hover === 'current' ? STROKE_WIDTH + 3 : STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={ARC_LENGTH}
            strokeDashoffset={ARC_LENGTH * (1 - valueFraction)}
            className="cursor-pointer transition-[stroke-width] duration-150"
            onMouseEnter={() => setHover('current')}
            onMouseLeave={() => setHover(null)}
            onClick={() => setHover((h) => (h === 'current' ? null : 'current'))}
          />
          <circle
            cx={projectionPoint.x}
            cy={projectionPoint.y}
            r={hover === 'projected' ? 9 : 7}
            fill={dotColor}
            stroke="white"
            strokeWidth={2}
            className="cursor-pointer transition-[r] duration-150"
            onMouseEnter={() => setHover('projected')}
            onMouseLeave={() => setHover(null)}
            onClick={() => setHover((h) => (h === 'projected' ? null : 'projected'))}
          />
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className="font-display tnum text-text text-[22px] md:text-[36px] leading-none">
            {Math.round(percent)}%
          </span>
          <span className="text-[8px] md:text-[11px] text-muted mt-0.5">usado del mes</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 text-[9px] md:text-[10px] text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ background: ARC_STROKE[tone] }} />
          Gastado
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ background: dotColor }} />
          Proyección
        </span>
      </div>

      <div className="flex justify-center">
        <span className={`text-[9px] md:text-[12px] font-medium px-2 py-0.5 md:px-3 md:py-1 rounded-full text-center ${PILL_TONE[pillTone]}`}>
          Proy. {roundedProjected}% · {pillLabel}
        </span>
      </div>

      {topBudgets.length > 0 && (
        <div className="space-y-1.5 md:space-y-2.5">
          {topBudgets.map((b) => {
            const rowTone: Tone = b.status === 'exceeded' ? 'bad' : b.status === 'warning' ? 'warn' : 'good';
            return (
              <div key={b.budget.id} className="space-y-1">
                <div className="flex items-center justify-between text-[10px] md:text-sm">
                  <span className="text-text flex items-center gap-1 truncate">
                    {b.categoryEmoji && <span>{b.categoryEmoji}</span>}
                    <span className="truncate">{b.categoryName}</span>
                  </span>
                  <span className={`tnum shrink-0 ml-2 ${TEXT_TONE[rowTone]}`}>
                    {Math.round(Math.min(b.percent, 100))}%
                  </span>
                </div>
                <ProgressBar value={Math.min(b.percent, 100)} tone={rowTone} height={7} />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
