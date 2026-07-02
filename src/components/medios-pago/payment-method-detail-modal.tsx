'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn, formatCurrency, formatUsd } from '@/lib/utils';
import { Transaction, RecurringPlan } from '@/types/database';
import { CalendarClock, ArrowUpCircle, ArrowDownCircle, CreditCard, Wallet, Banknote } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { parseLocalDate } from '@/lib/utils/dates';

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
      usdExpenses: number;
      arsExpenses: number;
      nextClosingDate?: Date;
      nextPaymentDate?: Date;
    };
    history: Transaction[];
    subscriptions: RecurringPlan[];
  };
}

/** Monto de un movimiento respetando su moneda original (USD no se convierte). */
function movementAmount(t: Transaction): string {
  if (t.original_currency === 'USD' && t.original_amount) {
    return formatUsd(Math.abs(Number(t.original_amount)));
  }
  return formatCurrency(Math.abs(Number(t.amount)));
}

export function PaymentMethodDetailModal({
  isOpen,
  onOpenChange,
  data,
}: PaymentMethodDetailModalProps) {
  const isCredit = data.type === 'credit';
  const { status, history, subscriptions } = data;

  // Crédito: ARS y USD por separado (sin conversión).
  const arsDue = status.arsExpenses;
  const usdDue = status.usdExpenses;
  const isCreditSettled = isCredit && arsDue === 0 && usdDue === 0;
  const balanceIsNegative = status.projectedTotal < 0;

  const Icon = isCredit ? CreditCard : (data.type === 'cash' ? Banknote : Wallet);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0 sm:max-w-[500px] bg-surface border-[1.5px] border-border text-text">
        <DialogHeader className="p-6 pb-0 flex-shrink-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent-deep">
              <Icon className="h-5 w-5" />
            </div>
            <DialogTitle className="text-xl font-bold text-text">{data.name}</DialogTitle>
          </div>
          <p className="text-xs text-muted uppercase tracking-widest font-medium">
            {isCredit ? 'Tarjeta de Crédito' : 'Cuenta / Efectivo'}
          </p>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 p-6 space-y-8">
          {/* Resumen de Saldos */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface-2 p-4 rounded-2xl border-[1.5px] border-border">
              <p className="text-[10px] text-muted uppercase mb-1 font-semibold">
                {isCredit ? 'A pagar este ciclo' : 'Saldo actual'}
              </p>
              {isCredit ? (
                isCreditSettled ? (
                  <p className="font-poster tnum text-xl leading-none text-good">Al día</p>
                ) : (
                  <div className="space-y-1">
                    {(arsDue > 0 || usdDue === 0) && (
                      <p className="font-poster tnum text-xl leading-none text-text">
                        {formatCurrency(arsDue)}
                      </p>
                    )}
                    {usdDue > 0 && (
                      <p
                        className={cn(
                          'font-poster tnum leading-none text-text',
                          arsDue > 0 ? 'text-sm text-muted' : 'text-xl'
                        )}
                      >
                        {formatUsd(usdDue)}
                      </p>
                    )}
                  </div>
                )
              ) : (
                <p
                  className={cn(
                    'font-poster tnum text-xl leading-none',
                    balanceIsNegative ? 'text-bad' : 'text-good'
                  )}
                >
                  {formatCurrency(status.projectedTotal)}
                </p>
              )}
            </div>
            <div className="bg-surface-2 p-4 rounded-2xl border-[1.5px] border-border">
              <p className="text-[10px] text-muted uppercase mb-1 font-semibold">Costos Fijos</p>
              <p className="font-poster tnum text-xl leading-none text-text">
                {formatCurrency(status.fixedCosts)}
              </p>
            </div>
          </div>

          {/* Listado de Movimientos */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text flex items-center gap-2">
                {isCredit ? 'Movimientos del Ciclo' : 'Movimientos del Mes'}
                <span className="text-[10px] bg-surface-2 text-muted px-2 py-0.5 rounded-full tnum">
                  {history.length}
                </span>
              </h3>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {history.length > 0 ? (
                history.map((t) => {
                  const localTDate = parseLocalDate(t.date);

                  return (
                    <div key={t.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border-[1.5px] border-border transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-2 rounded-lg",
                          t.type === 'income' ? "bg-good/10 text-good" : "bg-surface text-muted"
                        )}>
                          {t.type === 'income' ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowDownCircle className="h-4 w-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text">
                            {t.description}
                          </p>
                          <p className="text-[10px] text-muted">
                            {format(localTDate, "d 'de' MMMM", { locale: es })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          "text-sm font-bold tnum",
                          t.type === 'income' ? "text-good" : "text-text"
                        )}>
                          {t.type === 'income' ? '+' : '-'}{movementAmount(t)}
                        </p>
                        {t.installment_plan_id && (
                          <span className="text-[9px] text-accent-deep font-medium uppercase">Cuota</span>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 bg-surface-2 rounded-2xl border-[1.5px] border-dashed border-border">
                  <p className="text-xs text-muted italic">No hay movimientos registrados este mes</p>
                </div>
              )}
            </div>
          </div>

          {/* Mensualidades Adheridas */}
          {subscriptions.length > 0 && (
            <div className="space-y-3 pt-4 border-t-[1.5px] border-border">
              <h3 className="text-sm font-semibold text-text flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-accent-deep" />
                Mensualidades Activas
              </h3>
              <div className="grid grid-cols-1 gap-2">
                {subscriptions.map((sub) => (
                  <div key={sub.id} className="flex items-center justify-between p-2 px-3 rounded-lg bg-accent/5 border-[1.5px] border-accent/15">
                    <span className="text-xs text-text">{sub.description}</span>
                    <span className="text-xs tnum font-bold text-accent-deep">
                      {sub.currency === 'USD' && sub.original_amount
                        ? formatUsd(Math.abs(Number(sub.original_amount)))
                        : formatCurrency(sub.amount)}
                    </span>
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
