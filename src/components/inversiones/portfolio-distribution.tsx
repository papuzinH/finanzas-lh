"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { formatTickerCurrency } from '@/lib/utils';

interface PortfolioDistributionProps {
  data: { name: string; value: number; currency?: string }[];
}

const COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#14b8a6', // teal-500
];

export function PortfolioDistribution({ data }: PortfolioDistributionProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-full rounded-xl border border-slate-800 bg-slate-900/40 p-3 md:p-4 flex flex-col">
        <h3 className="text-xs md:text-sm font-semibold text-slate-300 mb-4">Composición</h3>
        <div className="flex-1 flex items-center justify-center text-slate-500 text-xs md:text-sm">
          No hay datos para mostrar
        </div>
      </div>
    );
  }

  return (
    <div className="h-full rounded-xl border border-slate-800 bg-slate-900/40 p-3 md:p-4 flex flex-col">
      <h3 className="text-xs md:text-sm font-semibold text-slate-300 mb-3 md:mb-4">Composición de Cartera</h3>
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
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', fontSize: '11px', color: '#e2e8f0' }}
              itemStyle={{ color: '#e2e8f0' }}
            />
            <Legend
              wrapperStyle={{ color: '#94a3b8', fontSize: '11px' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
