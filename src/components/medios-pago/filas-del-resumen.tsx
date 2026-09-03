'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { MoreVertical, ArrowLeftRight, Receipt } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { ActionSheet, type ActionSheetAction } from '@/components/ui/action-sheet';
import { MoverAlResumenDialog, type CuotasQueMueve } from './mover-al-resumen-dialog';
import { cn, formatCurrency, formatUsd } from '@/lib/utils';
import { parseLocalDate } from '@/lib/utils/dates';
import type { FilasDeResumen, ResumenNavegable } from '@/lib/finance/detalle-resumen';
import type { CreditCardCycle } from '@/lib/finance/cycles';
import type { ProcessedTransaction } from '@/lib/finance/types';
import type { InstallmentPlan, RecurringPlan } from '@/types/database';

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
 * Qué cuotas arrastra esta fila. `desde` (el número de ESTA cuota) sólo puede salir del
 * "(n/m)" de la descripción -- mismo regex que usa TransactionItem --, y esa descripción es
 * texto que el usuario puede editar desde /movimientos. `hasta` tiene una segunda fuente que
 * no depende del texto: `installment_plans.installments_count`, que se prefiere siempre.
 *
 * Antes esto devolvía `undefined` entero cuando el regex no matcheaba, y el diálogo se
 * quedaba SIN ningún aviso: mover una fila movía cuatro, en silencio, que es literalmente lo
 * que el spec dice que no puede pasar. Ahora el aviso baja de precisión, nunca desaparece.
 *
 * Exportada por el mismo motivo que `accionesDeFila`: el diálogo que la consume vive detrás
 * de un Portal cerrado, invisible en `renderToStaticMarkup`.
 */
export function cuotasQueMueveLaFila(
  t: ProcessedTransaction,
  planes: InstallmentPlan[],
): CuotasQueMueve | undefined {
  if (!t.installment_plan_id) return undefined;
  const m = t.description.match(/\((\d+)\/(\d+)\)$/);
  const delPlan = planes.find((p) => p.id === t.installment_plan_id)?.installments_count;
  return {
    desde: m ? parseInt(m[1], 10) : undefined,
    hasta: delPlan ?? (m ? parseInt(m[2], 10) : undefined),
  };
}

/**
 * Por qué "Mover a otro resumen" no se puede ofrecer, mirando SOLO los campos de la
 * transacción -- la disponibilidad de un vecino la decide `Fila` aparte (sin ninguno,
 * el menú entero no se monta, mismo criterio). Mismos motivos que los guards de
 * `moverTransaccionAlResumenVecino` (src/app/medios-pago/actions.ts), en el mismo orden.
 *
 * Fix round 1: el spec sólo negoció dos salidas para Editar/Eliminar -- reuso real, o
 * sacarlos del todo -- y "dejarlos deshabilitados para siempre" no era ninguna de las
 * dos. Fila ya no los ofrece: el ActionSheet, cuando se monta, tiene UNA sola acción
 * viva ("Mover a otro resumen"). Si esa acción tampoco se puede, no hay nada que
 * ofrecer y el menú entero queda sin montar (ver `mostrarMenu` en `Fila`) -- un sheet
 * que se abre para mostrar todo apagado no informa, frustra.
 */
function motivoMoverDeshabilitado(t: ProcessedTransaction): string | undefined {
  if (t.recurring_plan_id) return 'Las mensualidades se manejan desde Compromisos.';
  if (t.type === 'income') return 'Los reintegros no se mueven de resumen.';
  if (t.card_payment_for) return 'Un pago de tarjeta no pertenece a un resumen de consumo.';
  return undefined;
}

/**
 * La única acción del menú de una fila. Separada de `Fila` para que sea testeable con
 * `renderToStaticMarkup`: el ActionSheet que la monta vive detrás de un Dialog cerrado
 * por default (mismo problema de Portal-en-SSR que `mover-al-resumen-dialog.tsx`
 * documenta), así que su HTML nunca la muestra en un render de servidor.
 *
 * Sin parámetro `disabled`: `Fila` sólo llama a esto -- y sólo monta el ActionSheet --
 * cuando `motivoMoverDeshabilitado` da `undefined` Y hay al menos un vecino. La acción
 * que este menú ofrece está SIEMPRE viva.
 */
export function accionesDeFila(onMover: () => void): ActionSheetAction[] {
  return [
    {
      label: 'Mover a otro resumen',
      icon: <ArrowLeftRight className="h-5 w-5" />,
      onClick: onMover,
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
  ciclos,
  installmentPlans = [],
  onMovido,
}: {
  t: ProcessedTransaction;
  fechaDe?: 'compra' | 'movimiento' | 'ninguna';
  /** Resumen anterior al que la fila está mostrando. Sin él, «mover al anterior» no se ofrece. */
  anterior?: ResumenNavegable;
  /** Resumen siguiente. Sin él, «mover al siguiente» no se ofrece. */
  siguiente?: ResumenNavegable;
  /** Los ciclos completos de la tarjeta -- sólo para el aviso del destino real de la
   * última cuota en el diálogo (ver mover-al-resumen-dialog.tsx). Opcional a propósito. */
  ciclos?: CreditCardCycle[];
  /** Los planes de cuotas del usuario: `installments_count` es la fuente del total de
   * cuotas que no depende de la descripción (ver `cuotasQueMueveLaFila`). */
  installmentPlans?: InstallmentPlan[];
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

  // El menú tiene una sola acción posible ("Mover a otro resumen"): sin ningún vecino
  // a dónde mover, o con un motivo que lo impide (mensualidad, reintegro, pago de
  // tarjeta), esa acción no existe -- y sin ninguna acción viva no hay menú. Es justo
  // lo que corresponde en el detalle de una cuenta de débito, que llama a `Fila` sin
  // `anterior`/`siguiente`.
  const hayVecino = Boolean(anterior || siguiente);
  const motivoMover = motivoMoverDeshabilitado(t);
  const mostrarMenu = hayVecino && !motivoMover;

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
            actions={accionesDeFila(() => setMoverAbierto(true))}
          />
          <MoverAlResumenDialog
            open={moverAbierto}
            onOpenChange={setMoverAbierto}
            transaccion={t}
            anterior={anterior}
            siguiente={siguiente}
            cuotasQueMueve={cuotasQueMueveLaFila(t, installmentPlans)}
            ciclos={ciclos}
            onMovido={onMovido}
          />
        </>
      )}
    </div>
  );
}

/**
 * `anterior`/`siguiente`/`ciclos`/`installmentPlans`/`onMovido` viajan tal cual hasta cada `Fila`: es la
 * misma que decide, transacción por transacción, si el menú "Mover a otro resumen" se
 * puede montar (ver `mostrarMenu` en `Fila`). Sin `anterior` ni `siguiente` -- el caso de
 * `DetalleDeCuenta` para débito/efectivo -- ninguna fila lo ofrece, que es lo correcto.
 */
export function FilasDelResumen({
  filas,
  anterior,
  siguiente,
  ciclos,
  installmentPlans,
  onMovido,
}: {
  filas: FilasDeResumen;
  anterior?: ResumenNavegable;
  siguiente?: ResumenNavegable;
  ciclos?: CreditCardCycle[];
  installmentPlans?: InstallmentPlan[];
  onMovido?: () => void;
}) {
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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
        {filas.conFecha.map((t) => (
          <Fila key={t.id} t={t} anterior={anterior} siguiente={siguiente} ciclos={ciclos} installmentPlans={installmentPlans} onMovido={onMovido} />
        ))}
      </div>

      {filas.sinFecha.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 border-t-[1.5px] border-border pt-4">
          <div>
            <h3 className="text-sm font-semibold text-text">Sin fecha de compra</h3>
            <p className="text-xs text-muted">
              Se cargaron antes de que la app guardara cuándo compraste, así que no se pueden
              ordenar con las demás. Cuentan igual en el total.
            </p>
          </div>
          {filas.sinFecha.map((t) => (
            <Fila key={t.id} t={t} anterior={anterior} siguiente={siguiente} ciclos={ciclos} installmentPlans={installmentPlans} onMovido={onMovido} />
          ))}
        </div>
      )}

      {filas.reintegros.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 border-t-[1.5px] border-border pt-4">
          <div>
            <h3 className="text-sm font-semibold text-text">Reintegros y devoluciones</h3>
            <p className="text-xs text-muted">
              Restan del total de este resumen. No van con las compras: la app no guarda
              fecha de compra para un ingreso.
            </p>
          </div>
          {filas.reintegros.map((t) => (
            <Fila key={t.id} t={t} fechaDe="ninguna" anterior={anterior} siguiente={siguiente} ciclos={ciclos} installmentPlans={installmentPlans} onMovido={onMovido} />
          ))}
        </div>
      )}

      {filas.porDebitar.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 border-t-[1.5px] border-border pt-4">
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
