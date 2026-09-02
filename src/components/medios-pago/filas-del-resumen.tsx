'use client';

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Receipt } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { cn, formatCurrency, formatUsd } from '@/lib/utils';
import { parseLocalDate } from '@/lib/utils/dates';
import type { FilasDeResumen } from '@/lib/finance/detalle-resumen';
import type { ProcessedTransaction } from '@/lib/finance/types';
import type { RecurringPlan } from '@/types/database';

const monto = (t: ProcessedTransaction) =>
  t.original_currency === 'USD' && t.original_amount
    ? formatUsd(Math.abs(Number(t.original_amount)))
    : formatCurrency(Math.abs(Number(t.amount)));

/** Mismo criterio que `monto`, con los campos del plan. */
const montoDelPlan = (p: RecurringPlan) =>
  p.currency === 'USD' && p.original_amount
    ? formatUsd(Math.abs(Number(p.original_amount)))
    : formatCurrency(Math.abs(Number(p.amount)));

/**
 * Una mensualidad que el total del resumen YA cuenta y que todavia no se debito.
 * No es un movimiento: se dibuja apagada (bg-surface en vez de surface-2, todo el
 * texto en text-faint) para que no se confunda con una compra real. La etiqueta
 * "por debitar" es la que usaba la card de /ajustes/medios antes de la Task 7.
 *
 * Sin estas filas el total de arriba no era explicable por lo de abajo: un resumen
 * futuro mostraba un monto y, debajo, "Sin movimientos en este resumen".
 */
export function FilaPorDebitar({ plan }: { plan: RecurringPlan }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border-[1.5px] border-border bg-surface p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-faint">{plan.description}</p>
        <p className="text-[10px] text-faint">Mensualidad · por debitar</p>
      </div>
      <p className="shrink-0 tnum text-sm font-bold text-faint">-{montoDelPlan(plan)}</p>
    </div>
  );
}

/**
 * Exportada: la Task 7 la reusa para la lista del mes de cuentas y medios personales.
 *
 * `fechaDe` elige de qué campo sale la fecha:
 * - `'compra'` (default): `purchase_date`, y "Sin fecha" si no hay -- lo que usan los
 *   resúmenes de tarjeta, sin cambios. `t.date` en crédito es el VENCIMIENTO, sería la
 *   misma fecha repetida en todas las filas del resumen.
 * - `'movimiento'`: `t.date`, la fecha real del movimiento -- lo que usa
 *   `DetalleDeCuenta` para débito/efectivo y medios personales. Ahí `purchase_date` es
 *   `null` en TODO ingreso por diseño (el sueldo, transferencias: el caso frecuente,
 *   no el raro), así que quedaba "Sin fecha" en cada uno.
 */
export function Fila({ t, fechaDe = 'compra' }: { t: ProcessedTransaction; fechaDe?: 'compra' | 'movimiento' }) {
  const fecha =
    fechaDe === 'movimiento'
      ? format(parseLocalDate(t.date), 'd MMM', { locale: es })
      : t.purchase_date
        ? format(parseLocalDate(t.purchase_date), 'd MMM', { locale: es })
        : 'Sin fecha';

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border-[1.5px] border-border bg-surface-2 p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-text">{t.description}</p>
        <p className="text-[10px] text-muted">
          {fecha}
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
  const vacio =
    filas.conFecha.length === 0 && filas.sinFecha.length === 0 && filas.porDebitar.length === 0;

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

      {filas.porDebitar.length > 0 && (
        <div className="grid gap-2 border-t-[1.5px] border-border pt-4">
          <div>
            <h3 className="text-sm font-semibold text-text">Todavía sin debitar</h3>
            <p className="text-xs text-muted">
              Mensualidades adheridas a esta tarjeta que aún no tienen movimiento en este
              resumen. El total de arriba ya las cuenta.
            </p>
          </div>
          {filas.porDebitar.map((p) => <FilaPorDebitar key={p.id} plan={p} />)}
        </div>
      )}
    </div>
  );
}
