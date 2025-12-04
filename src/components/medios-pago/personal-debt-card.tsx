'use client';

import { User, ArrowRight } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { PaymentCardProps } from './institutional-card';

export function PersonalDebtCard({ data }: PaymentCardProps) {
  const { status } = data;
  
  const isDebt = status.currentConsumption < 0;
  const amount = Math.abs(status.currentConsumption);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 flex flex-col justify-between hover:border-slate-700 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300">
            <User className="h-4 w-4" />
          </div>
          <h3 className="font-medium text-slate-200">{data.name}</h3>
        </div>
      </div>

      <div className="mb-3">
        <p className="text-xs text-slate-500 mb-0.5">
          {isDebt ? 'Le debes' : 'A favor'}
        </p>
        <p className={cn("text-xl font-bold font-mono tracking-tight", isDebt ? "text-rose-400" : "text-emerald-400")}>
          {formatCurrency(amount)}
        </p>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-slate-500 bg-slate-950/50 py-1.5 px-2 rounded border border-slate-800/50">
        <ArrowRight className="h-3 w-3" />
        <span>
          {data.default_payment_day 
            ? `Se transfiere el día ${data.default_payment_day}` 
            : 'Sin fecha de pago definida'}
        </span>
      </div>
    </div>
  );
}
