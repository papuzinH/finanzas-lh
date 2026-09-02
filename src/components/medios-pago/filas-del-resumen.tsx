'use client';

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Receipt } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { cn, formatCurrency, formatUsd } from '@/lib/utils';
import { parseLocalDate } from '@/lib/utils/dates';
import type { FilasDeResumen } from '@/lib/finance/detalle-resumen';
import type { ProcessedTransaction } from '@/lib/finance/types';

const monto = (t: ProcessedTransaction) =>
  t.original_currency === 'USD' && t.original_amount
    ? formatUsd(Math.abs(Number(t.original_amount)))
    : formatCurrency(Math.abs(Number(t.amount)));

/** Exportada: la Task 7 la reusa para la lista del mes de cuentas y medios personales. */
export function Fila({ t }: { t: ProcessedTransaction }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border-[1.5px] border-border bg-surface-2 p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-text">{t.description}</p>
        <p className="text-[10px] text-muted">
          {/* La fecha de COMPRA. t.date en credito es el vencimiento: seria la misma en todas las filas. */}
          {t.purchase_date
            ? format(parseLocalDate(t.purchase_date), "d MMM", { locale: es })
            : 'Sin fecha'}
          {t.installment_plan_id && ' · Cuota'}
          {t.recurring_plan_id && ' · Mensualidad'}
        </p>
      </div>
      <p className={cn('shrink-0 tnum text-sm font-bold', t.type === 'income' ? 'text-good' : 'text-text')}>
        {t.type === 'income' ? '+' : '-'}{monto(t)}
      </p>
    </div>
  );
}

export function FilasDelResumen({ filas }: { filas: FilasDeResumen }) {
  const vacio = filas.conFecha.length === 0 && filas.sinFecha.length === 0;

  if (vacio) {
    return (
      <EmptyState
        icon={<Receipt className="h-5 w-5 text-muted" />}
        title="Sin movimientos en este resumen"
        description="Cuando cargues un consumo con esta tarjeta, va a aparecer acá."
      />
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        {filas.conFecha.map((t) => <Fila key={t.id} t={t} />)}
      </div>

      {filas.sinFecha.length > 0 && (
        <div className="grid gap-2 border-t-[1.5px] border-border pt-4">
          <div>
            <h3 className="text-sm font-semibold text-text">Sin fecha de compra</h3>
            <p className="text-xs text-muted">
              Se cargaron antes de que la app guardara cuándo compraste, así que no se pueden
              ordenar con las demás. Cuentan igual en el total.
            </p>
          </div>
          {filas.sinFecha.map((t) => <Fila key={t.id} t={t} />)}
        </div>
      )}
    </div>
  );
}
