'use client';

import { useFinanceStore } from '@/lib/store/financeStore';
import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { InfoHint } from '@/components/ui/info-hint';

type Tone = 'good' | 'warn' | 'bad';

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

  const overview = getBudgetsOverview();
  if (!overview) return null;

  const { percent, projectedPercent, status, willExceed } = overview;
  const tone: Tone = status === 'exceeded' ? 'bad' : status === 'warning' ? 'warn' : 'good';
  const valueFraction = Math.min(percent, 100) / 100;
  const projectionPoint = pointOnArc(Math.min(projectedPercent, 100) / 100);

  const pillTone: Tone = willExceed ? 'bad' : projectedPercent >= 90 ? 'warn' : 'good';
  const roundedProjected = Math.round(projectedPercent);
  const pillText = willExceed
    ? `Proyectás terminar en ${roundedProjected}% · te pasás`
    : pillTone === 'warn'
      ? `Proyectás terminar en ${roundedProjected}% · vas ajustado`
      : `Proyectás terminar en ${roundedProjected}% · te alcanza`;

  const topBudgets = getAllBudgetStatuses().slice(0, 2);

  return (
    <Card className="p-4 space-y-3">
      <div className="relative mx-auto" style={{ width: GAUGE_WIDTH, height: GAUGE_HEIGHT }}>
        <svg width={GAUGE_WIDTH} height={GAUGE_HEIGHT} viewBox={`0 0 ${GAUGE_WIDTH} ${GAUGE_HEIGHT}`}>
          <path d={ARC_PATH} fill="none" stroke="var(--surface-2)" strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
          <path
            d={ARC_PATH}
            fill="none"
            stroke={ARC_STROKE[tone]}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={ARC_LENGTH}
            strokeDashoffset={ARC_LENGTH * (1 - valueFraction)}
          />
          <circle
            cx={projectionPoint.x}
            cy={projectionPoint.y}
            r={7}
            fill={willExceed ? 'var(--bad)' : 'var(--good)'}
            stroke="white"
            strokeWidth={2}
          />
        </svg>
        <div className="absolute inset-x-0 bottom-1 flex flex-col items-center">
          <span className="font-poster tnum text-text text-[32px] leading-none">{Math.round(percent)}%</span>
          <span className="text-[11px] text-muted mt-0.5">usado del mes</span>
        </div>
      </div>

      <div className="flex justify-center">
        <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${PILL_TONE[pillTone]}`}>
          {pillText}
        </span>
      </div>

      {topBudgets.length > 0 && (
        <div className="space-y-2">
          {topBudgets.map((b) => {
            const rowTone: Tone = b.status === 'exceeded' ? 'bad' : b.status === 'warning' ? 'warn' : 'good';
            return (
              <div key={b.budget.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
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

      <div className="flex items-center gap-1.5 text-[11px] text-muted">
        <InfoHint label="Cómo se calcula la proyección">
          Proyectamos tu gasto de fin de mes según el ritmo diario de tus presupuestos activos
          y lo comparamos contra el tope total. El punto sobre el arco marca dónde vas a terminar.
        </InfoHint>
        <span>¿Cómo se calcula la proyección?</span>
      </div>
    </Card>
  );
}
