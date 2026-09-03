'use client';

import { isSameMonth } from 'date-fns';
import { Wallet } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { Fila } from '@/components/medios-pago/filas-del-resumen';
import { isExpenseInCurrentMonthScope } from '@/lib/finance/creditCycle';
import { cn, formatCurrency } from '@/lib/utils';
import { parseLocalDate } from '@/lib/utils/dates';
import type { AccountBalance } from '@/lib/finance/pocket';
import type { ProcessedTransaction } from '@/lib/finance/types';
import type { PaymentMethod } from '@/types/database';

/**
 * Detalle de una cuenta de debito/efectivo o de un medio personal: el contenido que
 * tenia el modal, PORTADO tal cual. No se rediseña acá -- queda fuera de alcance del
 * plan del detalle por resumen (spec 2026-09-02).
 *
 * `mostrarSaldo={false}` es para la tarjeta de credito SIN resumenes materializados
 * (sin `default_closing_day` no hay ciclos: asegurarCiclos la saltea y el backfill la
 * excluye). Ahi la pantalla necesita mostrar los movimientos y los costos fijos --
 * antes era un callejon sin salida --, pero NO el saldo: para una tarjeta ese numero
 * no es un "saldo actual", y la card de la lista muestra "A pagar este ciclo: Al día"
 * porque sin ciclo el desglose es 0. Dos numeros distintos para lo mismo es
 * exactamente lo que esta pantalla existe para evitar.
 */
export function DetalleDeCuenta({
  method,
  cuenta,
  status,
  transactions,
  paymentMethods,
  mostrarSaldo = true,
}: {
  method: PaymentMethod;
  cuenta: AccountBalance | null;
  status: { fixedCosts: number; projectedTotal: number };
  transactions: ProcessedTransaction[];
  paymentMethods: PaymentMethod[];
  mostrarSaldo?: boolean;
}) {
  const now = new Date();
  // Gastos por el scope del mes; ingresos por el mes calendario de `t.date`.
  //
  // OJO: esto YA NO es la regla general del repo. Desde `income_period` (2026-09-03)
  // los ingresos del mes se cuentan por `periodDate || date` (getMonthlyIncome, el
  // home, /movimientos, el chat): un cobro imputado cuenta en el mes que declaro el
  // usuario. Aca se sigue por `t.date` A PROPOSITO -- esta es la lista de los
  // movimientos que tocaron LA CUENTA, debajo de un "Saldo actual" que tambien va por
  // `t.date` (computeAccountBalance mira cuando entro o salio la plata, no a que mes
  // la imputo el usuario). Alinearla con getMonthlyIncome la desalinearia del numero
  // que tiene arriba, que es peor. No lo "arregles".
  const delMes = transactions.filter((t) => {
    if (t.payment_method_id !== method.id) return false;
    if (t.type === 'income') return isSameMonth(parseLocalDate(t.date), now);
    return isExpenseInCurrentMonthScope(t, paymentMethods, now);
  });

  // computeAvailableToSpend filtra los medios personales del bolsillo (no son
  // plata propia: lib/finance/pocket.ts): `cuenta` es SIEMPRE null para ellos, y
  // el fallback correcto es status.projectedTotal -- mismo patrón que
  // institutional-card.tsx (`cuenta ? cuenta.balance : status.projectedTotal`).
  // Para un medio personal ese número es una DEUDA, no un saldo: misma semántica
  // que personal-debt-card.tsx en la lista ("Le debés"/"A favor"), no "Saldo
  // actual" en verde -- ahí es donde daba siempre $0 antes de este fix.
  const saldo = cuenta ? cuenta.balance : status.projectedTotal;
  const esDeuda = method.is_personal;
  const negativo = saldo < 0;
  const monto = esDeuda ? Math.abs(saldo) : saldo;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className={cn('grid gap-4', mostrarSaldo ? 'grid-cols-2' : 'grid-cols-1')}>
        {mostrarSaldo && (
          <div className="rounded-2xl border-[1.5px] border-border bg-surface-2 p-4">
            <p className="mb-1 text-[10px] font-semibold uppercase text-muted">
              {esDeuda ? (negativo ? 'Le debés' : 'A favor') : 'Saldo actual'}
            </p>
            <p className={cn('font-display tnum text-xl leading-none', negativo ? 'text-bad' : 'text-good')}>
              {formatCurrency(monto)}
            </p>
            {cuenta && !cuenta.anchored && (
              <p className="mt-1 text-[10px] text-faint">Sin saldo declarado</p>
            )}
          </div>
        )}
        <div className="rounded-2xl border-[1.5px] border-border bg-surface-2 p-4">
          <p className="mb-1 text-[10px] font-semibold uppercase text-muted">Costos fijos</p>
          <p className="font-display tnum text-xl leading-none text-text">{formatCurrency(status.fixedCosts)}</p>
        </div>
      </div>

      {method.is_personal && (
        <p className="rounded-xl border-[1.5px] border-border bg-surface-2 px-3 py-2 text-xs text-muted">
          {method.default_payment_day
            ? `Se transfiere el día ${method.default_payment_day}`
            : 'Sin fecha de pago definida'}
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
        <h2 className="text-sm font-semibold text-text">Movimientos del mes</h2>
        {delMes.length > 0 ? (
          delMes.map((t) => <Fila key={t.id} t={t} fechaDe="movimiento" />)
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
