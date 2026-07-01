'use client';

import { BarChart, Bar, XAxis, ResponsiveContainer, Cell } from 'recharts';
import { useFinanceStore } from '@/lib/store/financeStore';

export function SavingsRateBars() {
  const getSavingsRateSeries = useFinanceStore((s) => s.getSavingsRateSeries);
  const data = getSavingsRateSeries(6);
  const hasData = data.some((d) => d.net !== 0);

  if (!hasData) {
    return <div className="h-[120px] flex items-center justify-center text-xs text-muted italic">Sin datos de ahorro</div>;
  }

  return (
    <div role="img" aria-label="Tasa de ahorro mensual" className="h-[120px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey="month" tick={{ fill: 'var(--muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
          <Bar dataKey="rate" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={700}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.rate >= 0 ? 'var(--good)' : 'var(--bad)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
