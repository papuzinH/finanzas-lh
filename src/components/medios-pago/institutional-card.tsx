'use client';

import { 
  CreditCard, 
  Wallet, 
  Banknote, 
  CalendarClock 
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn, formatCurrency } from '@/lib/utils';
import { PaymentMethod, Transaction, RecurringPlan } from '@/types/database';

export interface PaymentCardProps {
  data: PaymentMethod & {
    status: {
      currentConsumption: number;
      fixedCosts: number;
      projectedTotal: number;
      nextClosingDate?: Date;
      nextPaymentDate?: Date;
    };
    history: Transaction[];
    subscriptions: RecurringPlan[];
  };
}

export function InstitutionalCard({ data }: PaymentCardProps) {
  const isCredit = data.type === 'credit';
  const { status, history, subscriptions } = data;

  // Colores semánticos basados en el signo del valor
  const isNegative = status.projectedTotal < 0;
  const amountColor = isNegative ? "text-rose-400" : "text-emerald-400";

  const Icon = isCredit ? CreditCard : (data.type === 'cash' ? Banknote : Wallet);
  const iconColor = isCredit ? "text-purple-400" : "text-blue-400";
  const iconBg = isCredit ? "bg-purple-500/10" : "bg-blue-500/10";
  const borderColor = isCredit ? "border-slate-700/50 hover:border-purple-500/30" : "border-slate-800 hover:border-blue-500/30";

  return (
    <div className={cn("rounded-2xl border bg-slate-900/50 p-5 relative overflow-hidden transition-all", borderColor)}>
      
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconBg, iconColor)}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-100">{data.name}</h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">
                {isCredit ? 'Tarjeta de Crédito' : 'Cuenta / Efectivo'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Body: Montos y Fechas */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <p className="text-xs text-slate-400 mb-1">
            {isCredit ? 'Consumo Actual' : 'Saldo Disponible'}
          </p>
          <p className={cn("text-2xl font-bold font-mono tracking-tight", amountColor)}>
            {formatCurrency(status.projectedTotal)}
          </p>
        </div>

        {/* Fechas Clave (Solo Crédito) */}
        {isCredit && status.nextClosingDate && status.nextPaymentDate && (
          <div className="flex flex-col justify-center gap-2 text-xs border-l border-slate-800 pl-6">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Cierra el</span>
              <span className="font-medium text-slate-300">
                {format(status.nextClosingDate, 'd MMM', { locale: es })}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Vence el</span>
              <span className="font-medium text-amber-400">
                {format(status.nextPaymentDate, 'd MMM', { locale: es })}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Footer: Suscripciones y Movimientos */}
      <div className="space-y-4 pt-4 border-t border-slate-800/50">
        
        {/* Resumen Suscripciones */}
        {subscriptions.length > 0 && (
          <div className="flex items-center justify-between text-xs bg-slate-950/50 p-2 rounded-lg border border-slate-800/50">
            <div className="flex items-center gap-2 text-slate-400">
              <CalendarClock className="h-3.5 w-3.5" />
              <span>{subscriptions.length} servicios adheridos</span>
            </div>
            <span className="font-mono font-medium text-slate-300">
              {formatCurrency(status.fixedCosts)}
            </span>
          </div>
        )}

        {/* Últimos 3 movimientos */}
        <div className="space-y-2">
          {history.length > 0 ? (
            history.map((t, i) => (
              <div key={i} className="flex items-center justify-between text-xs group">
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="h-1.5 w-1.5 rounded-full bg-slate-700 group-hover:bg-slate-500 transition-colors" />
                  <span className="text-slate-400 truncate max-w-[150px]">{t.description}</span>
                </div>
                <span className="font-mono text-slate-500">
                  {formatCurrency(t.amount)}
                </span>
              </div>
            ))
          ) : (
            <p className="text-[10px] text-slate-600 italic pl-3">Sin movimientos recientes</p>
          )}
        </div>
      </div>
    </div>
  );
}
