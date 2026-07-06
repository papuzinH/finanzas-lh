'use client';

import { useFinanceStore } from '@/lib/store/financeStore';
import { Card } from '@/components/ui/card';
import { InfoHint } from '@/components/ui/info-hint';

type Tone = 'good' | 'warn' | 'bad';

const ARC_STROKE: Record<Tone, string> = {
  good: 'var(--good)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
};

const PILL_TONE: Record<Tone, string> = {
  good: 'bg-good/10 text-good',
  warn: 'bg-warn/10 text-warn',
  bad: 'bg-bad/10 text-bad',
};

// Card compacta: vive lado a lado con SavingsGoalsRingsCard en una grilla de
// 2 columnas (ver page.tsx), asi que el gauge esta dimensionado para una
// columna angosta (~170px con Card p-3) en vez de ancho completo.
const GAUGE_WIDTH = 132;
const GAUGE_HEIGHT = 78;
const RADIUS = 54;
const CENTER_X = GAUGE_WIDTH / 2;
const CENTER_Y = 70;
const STROKE_WIDTH = 10;
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
  const overview = getBudgetsOverview();
  if (!overview) return null;

  const { percent, projectedPercent, status, willExceed } = overview;
  const tone: Tone = status === 'exceeded' ? 'bad' : status === 'warning' ? 'warn' : 'good';
  const valueFraction = Math.min(percent, 100) / 100;
  const projectionPoint = pointOnArc(Math.min(projectedPercent, 100) / 100);

  const pillTone: Tone = willExceed ? 'bad' : projectedPercent >= 90 ? 'warn' : 'good';
  const roundedProjected = Math.round(projectedPercent);
  const pillLabel = willExceed ? 'te pasás' : pillTone === 'warn' ? 'ajustado' : 'alcanza';

  return (
    <Card className="relative p-3 space-y-2">
      <div className="absolute top-2 right-2">
        <InfoHint label="Cómo se calcula la proyección" align="end">
          Proyectamos tu gasto de fin de mes según el ritmo diario de tus presupuestos activos
          y lo comparamos contra el tope total.
        </InfoHint>
      </div>

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
            r={5}
            fill={willExceed ? 'var(--bad)' : 'var(--good)'}
            stroke="white"
            strokeWidth={1.5}
          />
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className="font-poster tnum text-text text-[20px] leading-none">{Math.round(percent)}%</span>
          <span className="text-[8px] text-muted mt-0.5">usado del mes</span>
        </div>
      </div>

      <div className="flex justify-center">
        <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full text-center ${PILL_TONE[pillTone]}`}>
          Proy. {roundedProjected}% · {pillLabel}
        </span>
      </div>
    </Card>
  );
}
