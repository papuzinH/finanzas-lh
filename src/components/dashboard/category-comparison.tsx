'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from 'recharts';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency } from '@/lib/utils';
import { TrendingUp } from 'lucide-react';

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const prev = payload.find((p) => p.name === 'Mes anterior');
  const curr = payload.find((p) => p.name === 'Mes actual');
  const prevVal = prev?.value ?? 0;
  const currVal = curr?.value ?? 0;

  const change = currVal - prevVal;
  const percentChange = prevVal === 0 ? 100 : (change / prevVal) * 100;
  const isUp = change > 0;

  return (
    <div className="rounded-xl border border-slate-700 bg-[var(--surface-overlay)] px-3 py-2.5 text-xs shadow-xl">
      <p className="mb-2 font-semibold text-slate-200">{label}</p>
      <div className="space-y-1">
        {prev && (
          <div className="flex items-center justify-between gap-6">
            <span className="text-slate-400">Mes anterior</span>
            <span className="font-mono text-slate-300">{formatCurrency(prevVal)}</span>
          </div>
        )}
        {curr && (
          <div className="flex items-center justify-between gap-6">
            <span className="text-slate-400">Mes actual</span>
            <span className="font-mono text-slate-300">{formatCurrency(currVal)}</span>
          </div>
        )}
        <div className="mt-2 flex items-center justify-between gap-6 border-t border-slate-700 pt-2">
          <span className="text-slate-500">Variación</span>
          <span className={`font-mono font-semibold ${isUp ? 'text-rose-400' : 'text-emerald-400'}`}>
            {isUp ? '+' : ''}{percentChange.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

export function CategoryComparison() {
  const getCategoryComparison = useFinanceStore((s) => s.getCategoryComparison);
  const data = getCategoryComparison();

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-[var(--surface-raised)]/30 p-5">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-200">Variación por Categoría</h3>
        </div>
        <div className="flex h-40 items-center justify-center">
          <p className="text-center text-xs italic text-slate-500">
            Necesitás al menos 2 meses de datos
          </p>
        </div>
      </div>
    );
  }

  const chartData = data.map((item) => ({
    name: item.emoji ? `${item.emoji}` : item.category.slice(0, 3),
    fullName: item.category,
    'Mes anterior': item.previous,
    'Mes actual': item.current,
    isUp: item.change > 0,
  }));

  return (
    <div className="rounded-2xl border border-slate-800 bg-[var(--surface-raised)]/30 p-5">
      <div className="mb-4 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-200">Variación por Categoría</h3>
        <span className="ml-auto text-[10px] text-slate-500">Top 5 mayor cambio</span>
      </div>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
            barCategoryGap="25%"
            barGap={3}
          >
            <XAxis
              type="number"
              tick={{ fill: '#64748b', fontSize: 10 }}
              tickFormatter={(v: number) => {
                if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
                if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
                return `$${v}`;
              }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: '#e2e8f0', fontSize: 14 }}
              width={28}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            />
            <Legend
              iconType="circle"
              iconSize={7}
              wrapperStyle={{ fontSize: '10px', color: '#94a3b8', paddingTop: '8px' }}
            />
            <Bar dataKey="Mes anterior" fill="#475569" radius={[0, 3, 3, 0]} maxBarSize={10} />
            <Bar dataKey="Mes actual" radius={[0, 3, 3, 0]} maxBarSize={10}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.isUp ? '#fb7185' : '#34d399'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
