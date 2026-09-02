'use client';

import { isSameMonth } from 'date-fns';
import { Wallet } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { Fila } from '@/components/medios-pago/filas-del-resumen';
import { isExpenseInCurrentMonthScope } from '@/lib/finance/creditCycle';
import { formatCurrency } from '@/lib/utils';
import { parseLocalDate } from '@/lib/utils/dates';
import { cn } from '@/lib/utils';
import type { AccountBalance } from '@/lib/finance/pocket';
import type { ProcessedTransaction } from '@/lib/finance/types';
import type { PaymentMethod } from '@/types/database';

/**
 * Detalle de una cuenta de debito/efectivo o de un medio personal: el contenido que
 * tenia el modal, PORTADO tal cual. No se rediseña acá -- queda fuera de alcance del
 * plan del detalle por resumen (spec 2026-09-02).
 */
export function DetalleDeCuenta({
  method,
  cuenta,
  fixedCosts,
  transactions,
  paymentMethods,
}: {
  method: PaymentMethod;
  cuenta: AccountBalance | null;
  fixedCosts: number;
  transactions: ProcessedTransaction[];
  paymentMethods: PaymentMethod[];
}) {
  const now = new Date();
  // La MISMA regla que usaba getPaymentMethodTransactionsForCurrentMonth para
  // no-credito, que esta task retira: gastos por el scope del mes, ingresos por
  // mes calendario de t.date.
  const delMes = transactions.filter((t) => {
    if (t.payment_method_id !== method.id) return false;
    if (t.type === 'income') return isSameMonth(parseLocalDate(t.date), now);
    return isExpenseInCurrentMonthScope(t, paymentMethods, now);
  });

  const saldo = cuenta?.balance ?? 0;

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border-[1.5px] border-border bg-surface-2 p-4">
          <p className="mb-1 text-[10px] font-semibold uppercase text-muted">Saldo actual</p>
          <p className={cn('font-display tnum text-xl leading-none', saldo < 0 ? 'text-bad' : 'text-good')}>
            {formatCurrency(saldo)}
          </p>
          {cuenta && !cuenta.anchored && (
            <p className="mt-1 text-[10px] text-faint">Sin saldo declarado</p>
          )}
        </div>
        <div className="rounded-2xl border-[1.5px] border-border bg-surface-2 p-4">
          <p className="mb-1 text-[10px] font-semibold uppercase text-muted">Costos fijos</p>
          <p className="font-display tnum text-xl leading-none text-text">{formatCurrency(fixedCosts)}</p>
        </div>
      </div>

      {method.is_personal && (
        <p className="rounded-xl border-[1.5px] border-border bg-surface-2 px-3 py-2 text-xs text-muted">
          {method.default_payment_day
            ? `Se transfiere el día ${method.default_payment_day}`
            : 'Sin fecha de pago definida'}
        </p>
      )}

      <div className="grid gap-2">
        <h2 className="text-sm font-semibold text-text">Movimientos del mes</h2>
        {delMes.length > 0 ? (
          delMes.map((t) => <Fila key={t.id} t={t} />)
        ) : (
          <EmptyState
            icon={<Wallet className="h-5 w-5 text-muted" />}
            title="Sin movimientos este mes"
            description="Lo que cargues con este medio va a aparecer acá."
          />
        )}
      </div>
    </div>
  );
}
