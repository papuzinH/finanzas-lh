'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn, formatCurrency } from '@/lib/utils';
import { Transaction, RecurringPlan } from '@/types/database';
import { CalendarClock, ArrowUpCircle, ArrowDownCircle, CreditCard, Wallet, Banknote } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface PaymentMethodDetailModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  data: {
    name: string;
    type: string;
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

export function PaymentMethodDetailModal({
  isOpen,
  onOpenChange,
  data,
}: PaymentMethodDetailModalProps) {
  const isCredit = data.type === 'credit';
  const { status, history, subscriptions } = data;

  const Icon = isCredit ? CreditCard : (data.type === 'cash' ? Banknote : Wallet);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-slate-900 border-slate-800 text-slate-200 p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <div className="flex items-center gap-3 mb-2">
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl",
              isCredit ? "bg-purple-500/10 text-purple-400" : "bg-blue-500/10 text-blue-400"
            )}>
              <Icon className="h-5 w-5" />
            </div>
            <DialogTitle className="text-xl font-bold text-white">{data.name}</DialogTitle>
          </div>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-medium">
            {isCredit ? 'Tarjeta de Crédito' : 'Cuenta / Efectivo'}
          </p>
        </DialogHeader>

        <div className="p-6 space-y-8">
          {/* Resumen de Saldos */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
              <p className="text-[10px] text-slate-500 uppercase mb-1 font-semibold">
                {isCredit ? 'Consumo Total' : 'Saldo Actual'}
              </p>
              <p className={cn(
                "text-xl font-bold font-mono",
                status.projectedTotal < 0 ? "text-rose-400" : "text-emerald-400"
              )}>
                {formatCurrency(status.projectedTotal)}
              </p>
            </div>
            <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
              <p className="text-[10px] text-slate-500 uppercase mb-1 font-semibold">Costos Fijos</p>
              <p className="text-xl font-bold font-mono text-slate-300">
                {formatCurrency(status.fixedCosts)}
              </p>
            </div>
          </div>

          {/* Listado de Movimientos */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                Movimientos del Mes
                <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
                  {history.length}
                </span>
              </h3>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {history.length > 0 ? (
                history.map((t) => {
                  const tDate = parseISO(t.date);
                  const localTDate = new Date(tDate.getTime() + tDate.getTimezoneOffset() * 60000);
                  
                  return (
                    <div key={t.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/30 border border-slate-800/30 hover:bg-slate-800/30 transition-colors group">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-2 rounded-lg",
                          t.type === 'income' ? "bg-emerald-500/10 text-emerald-500" : "bg-slate-800 text-slate-400"
                        )}>
                          {t.type === 'income' ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowDownCircle className="h-4 w-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">
                            {t.description}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {format(localTDate, "d 'de' MMMM", { locale: es })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          "text-sm font-bold font-mono",
                          t.type === 'income' ? "text-emerald-400" : "text-slate-300"
                        )}>
                          {t.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(t.amount))}
                        </p>
                        {t.installment_plan_id && (
                          <span className="text-[9px] text-indigo-400 font-medium uppercase">Cuota</span>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 bg-slate-950/20 rounded-2xl border border-dashed border-slate-800">
                  <p className="text-xs text-slate-600 italic">No hay movimientos registrados este mes</p>
                </div>
              )}
            </div>
          </div>

          {/* Suscripciones Adheridas */}
          {subscriptions.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-800/50">
              <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-purple-400" />
                Suscripciones Activas
              </h3>
              <div className="grid grid-cols-1 gap-2">
                {subscriptions.map((sub) => (
                  <div key={sub.id} className="flex items-center justify-between p-2 px-3 rounded-lg bg-purple-500/5 border border-purple-500/10">
                    <span className="text-xs text-slate-300">{sub.description}</span>
                    <span className="text-xs font-mono font-bold text-purple-300">{formatCurrency(sub.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
