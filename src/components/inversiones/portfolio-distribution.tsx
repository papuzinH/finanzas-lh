"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { formatTickerCurrency } from '@/lib/utils';

interface PortfolioDistributionProps {
  data: { name: string; value: number; currency?: string }[];
}

const COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
  'var(--chart-9)',
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
              contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: '8px', fontSize: '11px', color: 'var(--text)' }}
              itemStyle={{ color: 'var(--text)' }}
            />
            <Legend
              wrapperStyle={{ color: 'var(--muted)', fontSize: '11px' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
