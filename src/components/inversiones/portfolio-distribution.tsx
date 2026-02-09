"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface PortfolioDistributionProps {
  data: { name: string; value: number }[];
}

const COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
];

export function PortfolioDistribution({ data }: PortfolioDistributionProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-full rounded-xl border border-slate-800 bg-slate-900/40 p-4 flex flex-col">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">Composición</h3>
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
          No hay datos para mostrar
        </div>
      </div>
    );
  }

  return (
    <div className="h-full rounded-xl border border-slate-800 bg-slate-900/40 p-4 flex flex-col">
      <h3 className="text-sm font-semibold text-slate-300 mb-4">Composición de Cartera</h3>
      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) =>
                new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value)
              }
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', fontSize: '12px', color: '#e2e8f0' }}
              itemStyle={{ color: '#e2e8f0' }}
            />
            <Legend
              wrapperStyle={{ color: '#94a3b8', fontSize: '12px' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
