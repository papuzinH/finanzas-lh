'use client';

import {
  AreaChart,
  Area,
  XAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency } from '@/lib/utils';

const INCOME_COLOR = '#10B981';
const EXPENSE_COLOR = '#EF4444';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--surface-overlay)] border border-slate-800 rounded-xl px-3 py-2 text-xs space-y-1">
      <p className="text-slate-400 font-medium">{label}</p>
      {payload.map((entry: { name: string; value: number; color: string }) => (
        <div key={entry.name} className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-300 capitalize">{entry.name === 'income' ? 'Ingresos' : 'Gastos'}:</span>
          <span className="font-mono text-slate-100">{formatCurrency(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function TrendChart() {
  const { getMonthlyTrend } = useFinanceStore();
  const data = getMonthlyTrend(6);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={INCOME_COLOR} stopOpacity={0.2} />
            <stop offset="95%" stopColor={INCOME_COLOR} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={EXPENSE_COLOR} stopOpacity={0.2} />
            <stop offset="95%" stopColor={EXPENSE_COLOR} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#1e293b" />
        <XAxis
          dataKey="month"
          tick={{ fill: '#64748b', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="income"
          stroke={INCOME_COLOR}
          strokeWidth={2}
          fill="url(#incomeGradient)"
          fillOpacity={0.1}
          dot={false}
          activeDot={{ r: 4, fill: INCOME_COLOR }}
        />
        <Area
          type="monotone"
          dataKey="expense"
          stroke={EXPENSE_COLOR}
          strokeWidth={2}
          fill="url(#expenseGradient)"
          fillOpacity={0.1}
          dot={false}
          activeDot={{ r: 4, fill: EXPENSE_COLOR }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
