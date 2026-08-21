'use client';

import { BarChart, Bar, XAxis, ResponsiveContainer, Cell } from 'recharts';
import { useFinanceStore } from '@/lib/store/financeStore';

const TONE_COLOR: Record<'good' | 'warn' | 'bad', string> = {
  good: 'var(--good)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
};

export function SavingsRateBars({
  selectedMonth,
  onSelectMonth,
}: {
  selectedMonth: string | null;
  onSelectMonth: (month: string) => void;
}) {
  // El store entero, no el getter suelto (ver store-freshness.test.ts).
  const store = useFinanceStore();
  const data = store.getSavingsRateSeries(6);
  const hasData = data.some((d) => d.net !== 0);
  const activeMonth = selectedMonth ?? data[data.length - 1]?.month ?? null;

  if (!hasData) {
    return <div className="h-[120px] flex items-center justify-center text-xs text-muted italic">Sin datos de ahorro</div>;
  }

  return (
    <div aria-label="Tasa de ahorro mensual, tocá una barra para ver el detalle de ese mes" className="h-[120px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey="month" tick={{ fill: 'var(--muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
          <Bar
            dataKey="rate"
            radius={[4, 4, 0, 0]}
            isAnimationActive
            animationDuration={700}
            className="cursor-pointer"
            onClick={(bar: { payload?: { month?: string } }) => {
              if (bar.payload?.month) onSelectMonth(bar.payload.month);
            }}
          >
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={TONE_COLOR[d.tone]}
                fillOpacity={d.month === activeMonth ? 1 : 0.45}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
