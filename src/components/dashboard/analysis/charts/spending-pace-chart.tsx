'use client';

import { LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer } from 'recharts';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCompact } from '@/lib/utils';

export function SpendingPaceChart() {
  const { getMonthlySpendingPace, toDisplay, displayCurrency } = useFinanceStore();
  const pace = getMonthlySpendingPace();

  if (pace.points.length === 0) {
    return <div className="h-[140px] flex items-center justify-center text-xs text-muted italic">Todavía no registraste gastos este mes</div>;
  }

  // Serie con proyección hasta fin de mes (línea punteada desde hoy) — pace viene en ARS,
  // se convierte a la moneda de visualización acá (mismo patrón que TrendChart)
  const lastCumulative = toDisplay(pace.points[pace.points.length - 1].cumulative);
  const projData = [
    ...pace.points.map((p) => ({ day: p.day, real: toDisplay(p.cumulative), proj: null as number | null })),
    { day: pace.daysInMonth, real: null as number | null, proj: toDisplay(pace.projectedTotal) },
  ];
  projData[pace.points.length - 1].proj = lastCumulative;

  return (
    <div role="img" aria-label="Ritmo de gasto del mes con proyección" className="h-[140px] w-full relative">
      {displayCurrency === 'USD' && (
        <span className="absolute top-0 right-0 text-[9px] font-bold text-good bg-good/10 px-1.5 py-0.5 rounded z-10">USD</span>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={projData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="day" type="number" domain={[1, pace.daysInMonth]}
            tick={{ fill: 'var(--muted)', fontSize: 9 }} axisLine={false} tickLine={false}
            ticks={[1, pace.todayDay, pace.daysInMonth]} />
          <YAxis tick={{ fill: 'var(--muted)', fontSize: 9 }} axisLine={false} tickLine={false} width={38}
            tickFormatter={(v: number) => `$${formatCompact(v)}`} />
          {pace.income > 0 && (
            <ReferenceLine y={toDisplay(pace.income)} stroke="var(--bad)" strokeDasharray="3 3" strokeOpacity={0.6} />
          )}
          <Line type="monotone" dataKey="real" stroke="var(--text)" strokeWidth={2} dot={false} isAnimationActive animationDuration={900} connectNulls={false} />
          <Line type="monotone" dataKey="proj" stroke="var(--warn)" strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
