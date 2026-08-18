'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCompact } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';

// Verde ingreso, rojo gasto -- pero los del sistema, no los de Tailwind.
const INCOME_COLOR = 'var(--good)';
const EXPENSE_COLOR = 'var(--bad)';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const income = payload.find((e: { dataKey: string }) => e.dataKey === 'income')?.value ?? 0;
  const expenses = payload.find((e: { dataKey: string }) => e.dataKey === 'expenses')?.value ?? 0;
  const net = income - expenses;
  return (
    <div className="bg-surface border-[1.5px] border-border rounded-2xl px-4 py-3 shadow-card min-w-[160px] space-y-2">
      <p className="text-[11px] font-extrabold uppercase tracking-widest text-muted">{label}</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-xs text-text">
            <span className="w-2 h-2 rounded-full bg-good shrink-0" />
            Ingresos
          </span>
          <span className="font-display tnum text-xs text-good">+{formatCompact(income)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-xs text-text">
            <span className="w-2 h-2 rounded-full bg-bad shrink-0" />
            Gastos
          </span>
          <span className="font-display tnum text-xs text-bad">−{formatCompact(expenses)}</span>
        </div>
        <div className="h-px bg-border my-1" />
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs font-semibold text-text">Balance</span>
          <span className={`font-display tnum text-sm ${net >= 0 ? 'text-good' : 'text-bad'}`}>
            {net >= 0 ? '+' : '−'}{formatCompact(Math.abs(net))}
          </span>
        </div>
      </div>
    </div>
  );
}

interface TrendChartProps {
  onTap?: () => void;
}

export function TrendChart({ onTap }: TrendChartProps) {
  const { getMonthlyTrend, toDisplay, displayCurrency } = useFinanceStore();
  const raw = getMonthlyTrend(6);
  const data = raw.map((p) => ({ ...p, income: toDisplay(p.income), expenses: toDisplay(p.expenses) }));
  const hasData = data.some((point) => point.income > 0 || point.expenses > 0);

  return (
    <figure
      role="img"
      aria-label="Tendencia de ingresos vs gastos de los últimos 6 meses"
      className="w-full"
    >
      <div className="relative h-[200px] sm:h-[220px] w-full overflow-hidden rounded-xl">
        {displayCurrency === 'USD' && (
          <span className="absolute top-1 right-1 text-[9px] font-bold text-good bg-good/10 px-1.5 py-0.5 rounded z-10">USD</span>
        )}
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
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
              <CartesianGrid vertical={false} stroke="var(--color-border, #DCD3BC)" strokeOpacity={0.5} />
              <XAxis
                dataKey="month"
                tick={{ fill: 'var(--color-muted, #5B6577)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--color-muted, #5B6577)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={42}
                tickFormatter={(v: number) => {
                  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
                  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
                  return `$${v}`;
                }}
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
                dataKey="expenses"
                stroke={EXPENSE_COLOR}
                strokeWidth={2}
                fill="url(#expenseGradient)"
                fillOpacity={0.1}
                dot={false}
                activeDot={{ r: 4, fill: EXPENSE_COLOR }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full w-full rounded-xl border-[1.5px] border-border bg-surface-2/40 flex items-center justify-center px-4">
            <p className="text-xs text-muted text-center">Aun no hay datos suficientes para mostrar la tendencia.</p>
          </div>
        )}

        {/* Tap overlay — invisible touch target over the chart */}
        {onTap && hasData && (
          <button
            onClick={onTap}
            aria-label="Ver detalle mensual"
            className="absolute inset-0 w-full h-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded-xl"
          />
        )}
      </div>

      {/* Hint de tap */}
      {onTap && hasData && (
        <button
          onClick={onTap}
          className="mt-2 flex items-center gap-1 text-[11px] text-muted hover:text-accent transition-colors focus-visible:outline-none"
        >
          <ChevronRight className="w-3 h-3" />
          Ver detalle por mes
        </button>
      )}
    </figure>
  );
}
