"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { formatTickerCurrency } from '@/lib/utils';

interface PortfolioDistributionProps {
  data: { name: string; value: number; currency?: string }[];
}

const COLORS = [
  '#5E98BC', // accent/celeste
  '#2E7D5B', // good
  '#E3A938', // warn
  '#C2403A', // bad
  '#3C708F', // accent-deep
  '#A9CFE0', // accent-soft
  '#1C2A47', // navy
  '#5b6577', // muted
  '#292e3a', // hero
];

export function PortfolioDistribution({ data }: PortfolioDistributionProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-full rounded-xl border-[1.5px] border-border bg-surface p-3 md:p-4 flex flex-col">
        <h3 className="text-xs md:text-sm font-bold text-text mb-4">Composición</h3>
        <div className="flex-1 flex items-center justify-center text-muted text-xs md:text-sm">
          No hay datos para mostrar
        </div>
      </div>
    );
  }

  return (
    <div className="h-full rounded-xl border-[1.5px] border-border bg-surface p-3 md:p-4 flex flex-col">
      <h3 className="text-xs md:text-sm font-bold text-text mb-3 md:mb-4">Composición de Cartera</h3>
      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="45%"
              outerRadius="65%"
              paddingAngle={4}
              dataKey="value"
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, _name: string, props: { payload?: { name?: string; currency?: string } }) => {
                const ticker = props.payload?.name;
                const currency = props.payload?.currency;
                return formatTickerCurrency(value, ticker, currency);
              }}
              contentStyle={{ backgroundColor: '#FFFFFF', borderColor: 'rgba(28,42,71,0.16)', borderRadius: '8px', fontSize: '11px', color: '#1C2A47' }}
              itemStyle={{ color: '#1C2A47' }}
            />
            <Legend
              wrapperStyle={{ color: '#5b6577', fontSize: '11px' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
