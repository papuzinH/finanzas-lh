'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { parseLocalDate } from '@/lib/utils/dates';
import { moverTransaccionAlResumenVecino } from '@/app/medios-pago/actions';
import { cicloNEsimo, type CreditCardCycle } from '@/lib/finance/cycles';
import type { DireccionDeMovimiento } from '@/lib/finance/mover-resumen';
import type { ResumenNavegable } from '@/lib/finance/detalle-resumen';
import type { ProcessedTransaction } from '@/lib/finance/types';

const corto = (d: string) => format(parseLocalDate(d), 'd MMM', { locale: es });
const mes = (d: string) => format(parseLocalDate(d), 'MMMM', { locale: es });

/**
 * Cuotas que arrastra el movimiento, sacadas de la descripción ("(3/6)") por el llamador.
 * `desde`/`hasta` son el NUMERO de cuota (no un índice): "(3/6)" -- vas a mover la cuota 3
 * de 6, y todas las siguientes hasta la 6 (que es, por diseño, también la ÚLTIMA del plan).
 */
export type CuotasQueMueve = { desde: number; hasta: number };

type Vecino = { direccion: DireccionDeMovimiento; resumen: ResumenNavegable };

/**
 * Cómo se nombra un resumen: por su CIERRE primero y su vencimiento después. Para decidir
 * a qué resumen pertenece una compra se compara contra el cierre, no contra el vencimiento
 * -- y el cierre es el dato que el usuario tiene impreso en el papel del banco. El tiempo
 * verbal sale de `estado`, no de `new Date()`: `'proyectado'` es exactamente "todavía no
 * cerró" (ver `estadoDeResumen` en lib/finance/detalle-resumen.ts), así que el texto no
 * depende del reloj y se puede testear.
 */
const etiquetaDeResumen = (r: ResumenNavegable) =>
  `El que ${r.estado === 'proyectado' ? 'cierra' : 'cerró'} el ${corto(r.closingDate)} · vence ${corto(r.dueDate)}`;

/**
 * Qué le pasa a este consumo si lo mandás a ESE resumen. No es decoración: el disponible
 * sólo retiene el resumen vigente y el inmediato anterior impago (`computePendingCreditCards`),
 * así que mover un consumo a un resumen pagado o a uno que ya salió de esa ventana lo saca
 * de lo que la app te dice que debés -- y el disponible sube sin que hayas pagado nada.
 * El modelo no cambia en esta rama (excede su alcance); lo que sí se hace es DECIRLO, y
 * por opción: con un vecino pagado y otro no, un aviso suelto arriba mentía sobre los dos.
 */
function avisoDelDestino(r: ResumenNavegable): string | undefined {
  if (r.estado === 'pagado') {
    return 'Ese resumen ya lo pagaste: este consumo no va a volver a contarse en lo que debés.';
  }
  if (r.estado === 'vencido') {
    return 'Ese resumen ya venció sin pagar. La app sólo sigue reclamando el último impago: si hay otro más nuevo sin pagar, este consumo deja de contarse en lo que debés.';
  }
  return undefined;
}

/**
 * A qué resumen cae la ÚLTIMA cuota que arrastra el plan si se mueve hacia `destino`.
 *
 * `cicloActual` es el ciclo de la transacción TOCADA (no el de la última cuota): la
 * distancia hasta la última es siempre `hasta - desde` resúmenes más allá, tanto en el
 * origen como en cualquier destino candidato -- es el mismo invariante que usa
 * `planDeMovimiento` en el server (cada cuota vive en el resumen N-ésimo desde la
 * tocada). `ciclos` tiene que ser la lista COMPLETA de la tarjeta, en el shape crudo de
 * `credit_card_cycles` (no `ResumenNavegable`): es lo único con lo que `cicloNEsimo` sabe
 * trabajar.
 */
function ultimaCuotaCaeEn(
  ciclos: CreditCardCycle[],
  cicloDesde: CreditCardCycle | undefined,
  cuotasQueMueve: CuotasQueMueve | undefined,
): CreditCardCycle | undefined {
  if (!cicloDesde || !cuotasQueMueve) return undefined;
  return cicloNEsimo(ciclos, cicloDesde, cuotasQueMueve.hasta - cuotasQueMueve.desde);
}

/**
 * El contenido del diálogo, SIN el Dialog que lo envuelve.
 *
 * Separado a propósito: DialogContent vive detrás de un Portal (@radix-ui/react-portal)
 * que espera a un `useLayoutEffect` para decidir el contenedor -- ese efecto nunca corre
 * en un render de servidor, así que en `renderToStaticMarkup` (sin jsdom, como corren los
 * tests de este repo) SIEMPRE devuelve null, esté `open` en true o en false. Verificado a
 * mano: `renderToStaticMarkup(<Dialog open><DialogContent>x</DialogContent></Dialog>)` da
 * `''`. Si el contenido testeable viviera adentro de DialogContent, cualquier assert que
 * busque texto real fallaría siempre -- no por un bug del componente, sino por cómo
 * funciona el portal en SSR. Mismo patrón que `ciclo-fechas-field.tsx`
 * (EtiquetaProcedencia/CicloFechasField se testean sueltos, no envueltos en el diálogo
 * que los monta).
 */
export function ContenidoMoverAlResumen({
  anterior,
  siguiente,
  cuotasQueMueve,
  ciclos = [],
  cicloActualId,
  onElegir,
  moviendo = null,
}: {
  anterior?: ResumenNavegable;
  siguiente?: ResumenNavegable;
  cuotasQueMueve?: CuotasQueMueve;
  /** Los ciclos COMPLETOS de la tarjeta (shape crudo, no `ResumenNavegable`): sólo hacen
   * falta para calcular, por dirección, a qué resumen cae la última cuota del plan. */
  ciclos?: CreditCardCycle[];
  /** `cycle_id` de la transacción tocada: de ahí sale la distancia a la última cuota. */
  cicloActualId?: string | null;
  onElegir: (direccion: DireccionDeMovimiento) => void;
  moviendo?: DireccionDeMovimiento | null;
}) {
  const vecinos: Vecino[] = [
    ...(anterior ? [{ direccion: 'anterior' as const, resumen: anterior }] : []),
    ...(siguiente ? [{ direccion: 'siguiente' as const, resumen: siguiente }] : []),
  ];

  // De dónde sale la última cuota HOY, para poder decir "de marzo a abril" y no sólo
  // "a abril". undefined si no hay `ciclos`/`cicloActualId` (compra suelta, o un
  // llamador -- como los tests de este archivo -- que no los pasa): en ese caso el
  // aviso por opción no se muestra, y el texto de arriba se queda con el conteo solo.
  const cicloActual = cicloActualId ? ciclos.find((c) => c.id === cicloActualId) : undefined;
  const cicloOrigenUltima = ultimaCuotaCaeEn(ciclos, cicloActual, cuotasQueMueve);

  return (
    <div className="grid gap-3">
      {cuotasQueMueve && (
        <p className="text-xs text-muted">
          Esta cuota arrastra el plan: vas a mover las cuotas {cuotasQueMueve.desde} a{' '}
          {cuotasQueMueve.hasta}.
        </p>
      )}

      <div className="grid gap-2">
        {vecinos.length === 0 && (
          <p className="text-xs text-muted">No hay otro resumen disponible para mover este movimiento.</p>
        )}
        {vecinos.map(({ direccion, resumen }) => {
          const cicloDestino = ciclos.find((c) => c.id === resumen.id);
          const cicloDestinoUltima = ultimaCuotaCaeEn(ciclos, cicloDestino, cuotasQueMueve);
          const aviso = avisoDelDestino(resumen);
          return (
            <div key={direccion} className="grid gap-1">
              <Button
                type="button"
                variant="soft"
                disabled={moviendo !== null}
                onClick={() => onElegir(direccion)}
                className="min-h-[44px] w-full justify-start border-[1.5px] border-border bg-surface text-left font-normal"
              >
                {etiquetaDeResumen(resumen)}
              </Button>
              {cicloOrigenUltima && cicloDestinoUltima && (
                <p className="px-1 text-[11px] text-muted">
                  La última pasa de {mes(cicloOrigenUltima.due_date)} a {mes(cicloDestinoUltima.due_date)}.
                </p>
              )}
              {aviso && <p className="px-1 text-[11px] text-warn">{aviso}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * El paso 2 del menú de la fila: elegir a cuál de los dos resúmenes vecinos mover un
 * consumo de tarjeta. No hace falta un "confirmar" aparte -- tocar el vecino ES la
 * confirmación, la fecha real que muestra el botón es lo que el usuario coteja contra
 * el papel del banco.
 */
export function MoverAlResumenDialog({
  open,
  onOpenChange,
  transaccion,
  anterior,
  siguiente,
  cuotasQueMueve,
  ciclos,
  onMovido,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaccion: ProcessedTransaction;
  /** Resumen anterior al que se puede mover. Sin él, esa opción no se ofrece. */
  anterior?: ResumenNavegable;
  /** Resumen siguiente. Sin él, esa opción no se ofrece. */
  siguiente?: ResumenNavegable;
  cuotasQueMueve?: CuotasQueMueve;
  /** Los ciclos completos de la tarjeta, para el aviso del destino real de la última
   * cuota (ver `ultimaCuotaCaeEn`). Sin ellos, ese aviso simplemente no se muestra. */
  ciclos?: CreditCardCycle[];
  /** Se llama después de mover, para que la pantalla refresque el store. */
  onMovido?: () => void;
}) {
  const [moviendo, setMoviendo] = useState<DireccionDeMovimiento | null>(null);

  const elegir = async (direccion: DireccionDeMovimiento) => {
    setMoviendo(direccion);
    const res = await moverTransaccionAlResumenVecino(transaccion.id, direccion);
    setMoviendo(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    onOpenChange(false);
    onMovido?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-[1.5px] border-border text-text">
        <DialogHeader>
          <DialogTitle>Mover a otro resumen</DialogTitle>
        </DialogHeader>
        <ContenidoMoverAlResumen
          anterior={anterior}
          siguiente={siguiente}
          cuotasQueMueve={cuotasQueMueve}
          ciclos={ciclos}
          cicloActualId={transaccion.cycle_id}
          onElegir={elegir}
          moviendo={moviendo}
        />
      </DialogContent>
    </Dialog>
  );
}
