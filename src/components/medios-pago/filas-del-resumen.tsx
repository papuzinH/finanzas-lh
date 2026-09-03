'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { MoreVertical, Pencil, Trash2, ArrowLeftRight, Receipt } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { ActionSheet, type ActionSheetAction } from '@/components/ui/action-sheet';
import { MoverAlResumenDialog } from './mover-al-resumen-dialog';
import { cn, formatCurrency, formatUsd } from '@/lib/utils';
import { parseLocalDate } from '@/lib/utils/dates';
import type { FilasDeResumen, ResumenNavegable } from '@/lib/finance/detalle-resumen';
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

/** Mismo hint que usa TransactionItem (/movimientos) para una cuota. */
const HINT_CUOTA = 'Esta transacción pertenece a un plan de cuotas.';
/** Editar/eliminar todavía no están cableados desde acá (fuera de alcance de esta task). */
const HINT_SIN_CABLEAR = 'Todavía no se puede editar desde acá.';

/** "Notebook (3/6)" -> { desde: 3, hasta: 6 }. Mismo regex que usa TransactionItem. */
function cuotasDeLaDescripcion(descripcion: string): { desde: number; hasta: number } | undefined {
  const m = descripcion.match(/\((\d+)\/(\d+)\)$/);
  return m ? { desde: parseInt(m[1], 10), hasta: parseInt(m[2], 10) } : undefined;
}

/**
 * Por qué "Mover a otro resumen" puede estar deshabilitado, mirando SOLO los campos de
 * la transacción -- la disponibilidad de un vecino la decide `Fila` (si no hay ninguno,
 * el menú entero no se monta). Mismos motivos que los guards de
 * `moverTransaccionAlResumenVecino` (src/app/medios-pago/actions.ts), en el mismo orden.
 */
function motivoMoverDeshabilitado(t: ProcessedTransaction): string | undefined {
  if (t.recurring_plan_id) return 'Las mensualidades se manejan desde Compromisos.';
  if (t.type === 'income') return 'Los reintegros no se mueven de resumen.';
  if (t.card_payment_for) return 'Un pago de tarjeta no pertenece a un resumen de consumo.';
  return undefined;
}

/**
 * Las acciones del menú de una fila. Separado de `Fila` para que sea testeable con
 * `renderToStaticMarkup`: el ActionSheet que las monta vive detrás de un Dialog cerrado
 * por default (mismo problema de Portal-en-SSR que `mover-al-resumen-dialog.tsx`
 * documenta), así que su HTML nunca las muestra en un render de servidor.
 */
export function accionesDeFila(t: ProcessedTransaction, onMover: () => void): ActionSheetAction[] {
  const hintEditarEliminar = t.installment_plan_id ? HINT_CUOTA : HINT_SIN_CABLEAR;
  const motivoMover = motivoMoverDeshabilitado(t);

  return [
    {
      label: 'Editar',
      icon: <Pencil className="h-5 w-5" />,
      onClick: () => {},
      disabled: true,
      disabledHint: hintEditarEliminar,
    },
    {
      label: 'Eliminar',
      icon: <Trash2 className="h-5 w-5" />,
      onClick: () => {},
      disabled: true,
      disabledHint: hintEditarEliminar,
    },
    {
      label: 'Mover a otro resumen',
      icon: <ArrowLeftRight className="h-5 w-5" />,
      onClick: onMover,
      disabled: Boolean(motivoMover),
      disabledHint: motivoMover,
    },
  ];
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
 * - `'ninguna'`: sin fecha, a propósito -- los reintegros de un resumen de tarjeta. No
 *   tienen `purchase_date` (null en todo `income`) y su `t.date` es el VENCIMIENTO que
 *   les puso `createTransaction`, no el día del reintegro: cualquiera de las dos sería
 *   una fecha inventada.
 */
export function Fila({
  t,
  fechaDe = 'compra',
  anterior,
  siguiente,
  onMovido,
}: {
  t: ProcessedTransaction;
  fechaDe?: 'compra' | 'movimiento' | 'ninguna';
  /** Resumen anterior al que la fila está mostrando. Sin él, «mover al anterior» no se ofrece. */
  anterior?: ResumenNavegable;
  /** Resumen siguiente. Sin él, «mover al siguiente» no se ofrece. */
  siguiente?: ResumenNavegable;
  /** Se llama después de mover, para que la pantalla refresque el store. */
  onMovido?: () => void;
}) {
  const [sheetAbierto, setSheetAbierto] = useState(false);
  const [moverAbierto, setMoverAbierto] = useState(false);

  const fecha =
    fechaDe === 'ninguna'
      ? null
      : fechaDe === 'movimiento'
        ? format(parseLocalDate(t.date), 'd MMM', { locale: es })
        : t.purchase_date
          ? format(parseLocalDate(t.purchase_date), 'd MMM', { locale: es })
          : 'Sin fecha';

  const meta = [fecha, t.installment_plan_id && 'Cuota', t.recurring_plan_id && 'Mensualidad']
    .filter(Boolean)
    .join(' · ');

  // Sin ningún vecino no hay a dónde mover: el menú entero no se ofrece. Es justo lo
  // que corresponde en el detalle de una cuenta de débito, que llama a `Fila` sin estas
  // props.
  const mostrarMenu = Boolean(anterior || siguiente);

  const montoTexto = (
    <p className={cn('tnum text-sm font-bold', t.type === 'income' ? 'text-good' : 'text-text')}>
      {t.type === 'income' ? '+' : '-'}{monto(t)}
    </p>
  );

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border-[1.5px] border-border bg-surface-2 p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-text">{t.description}</p>
        {meta && <p className="text-[10px] text-muted">{meta}</p>}
      </div>
      {mostrarMenu ? (
        <div className="flex shrink-0 items-center gap-1">
          {montoTexto}
          <button
            type="button"
            aria-label="Más opciones"
            onClick={() => setSheetAbierto(true)}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-muted hover:bg-surface hover:text-text"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <p className={cn('shrink-0 tnum text-sm font-bold', t.type === 'income' ? 'text-good' : 'text-text')}>
          {t.type === 'income' ? '+' : '-'}{monto(t)}
        </p>
      )}

      {mostrarMenu && (
        <>
          <ActionSheet
            open={sheetAbierto}
            onOpenChange={setSheetAbierto}
            title={t.description}
            actions={accionesDeFila(t, () => setMoverAbierto(true))}
          />
          <MoverAlResumenDialog
            open={moverAbierto}
            onOpenChange={setMoverAbierto}
            transaccion={t}
            anterior={anterior}
            siguiente={siguiente}
            cuotasQueMueve={t.installment_plan_id ? cuotasDeLaDescripcion(t.description) : undefined}
            onMovido={onMovido}
          />
        </>
      )}
    </div>
  );
}

export function FilasDelResumen({ filas }: { filas: FilasDeResumen }) {
  const vacio =
    filas.conFecha.length === 0 &&
    filas.sinFecha.length === 0 &&
    filas.reintegros.length === 0 &&
    filas.porDebitar.length === 0;

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

      {filas.reintegros.length > 0 && (
        <div className="grid gap-2 border-t-[1.5px] border-border pt-4">
          <div>
            <h3 className="text-sm font-semibold text-text">Reintegros y devoluciones</h3>
            <p className="text-xs text-muted">
              Restan del total de este resumen. No van con las compras: la app no guarda
              fecha de compra para un ingreso.
            </p>
          </div>
          {filas.reintegros.map((t) => <Fila key={t.id} t={t} fechaDe="ninguna" />)}
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
