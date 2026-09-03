'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { parseLocalDate } from '@/lib/utils/dates';
import { moverTransaccionAlResumenVecino } from '@/app/medios-pago/actions';
import type { DireccionDeMovimiento } from '@/lib/finance/mover-resumen';
import type { ResumenNavegable } from '@/lib/finance/detalle-resumen';
import type { ProcessedTransaction } from '@/lib/finance/types';

const corto = (d: string) => format(parseLocalDate(d), 'd MMM', { locale: es });

/**
 * Cuotas que arrastra el movimiento, sacadas de la descripción ("(3/6)") por el llamador.
 *
 * Fix round 1 (Minor, dejado abierto a propósito): el spec pide nombrar el destino real
 * de la última cuota ("la última pasa de marzo a abril"), no sólo el conteo. No lo pude
 * calcular con los datos que este componente recibe, y prefiero decirlo en vez de
 * inventarlo:
 *
 * - La fecha ORIGINAL de la última cuota no es la de la transacción tocada -- es la del
 *   ciclo N pasos adelante (`cicloNEsimo`, `lib/finance/cycles.ts`), donde N = hasta -
 *   desde. `Fila` sólo tiene la fila tocada (`t: ProcessedTransaction`), no sus hermanas
 *   de plan ni la lista completa de `credit_card_cycles` de la tarjeta.
 * - La fecha NUEVA depende de la dirección elegida (`anterior` vs `siguiente`), así que
 *   ni siquiera es un dato único: son dos, uno por botón. Este aviso se muestra una sola
 *   vez arriba de los dos botones (por diseño del brief), así que mostrar la fecha exacta
 *   exigiría además moverlo adentro de cada botón.
 *
 * Cerrar esto bien pide que `Fila` (o quien la llame) reciba también el `ciclos:
 * CreditCardCycle[]` completo de la tarjeta -- lo mismo que ya usa
 * `moverTransaccionAlResumenVecino` en el server para correr `planDeMovimiento` -- y
 * pase el resultado ya resuelto (por dirección) hasta acá. Es más que un tweak de texto:
 * cambia la firma de `Fila` otra vez. Quedó fuera de esta task; el texto de abajo se
 * queda honesto ("se corren un resumen") en vez de fabricar un mes.
 */
export type CuotasQueMueve = { desde: number; hasta: number };

type Vecino = { direccion: DireccionDeMovimiento; resumen: ResumenNavegable };

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
  onElegir,
  moviendo = null,
}: {
  anterior?: ResumenNavegable;
  siguiente?: ResumenNavegable;
  cuotasQueMueve?: CuotasQueMueve;
  onElegir: (direccion: DireccionDeMovimiento) => void;
  moviendo?: DireccionDeMovimiento | null;
}) {
  const vecinos: Vecino[] = [
    ...(anterior ? [{ direccion: 'anterior' as const, resumen: anterior }] : []),
    ...(siguiente ? [{ direccion: 'siguiente' as const, resumen: siguiente }] : []),
  ];

  const algunoPagado = vecinos.some((v) => v.resumen.estado === 'pagado');

  return (
    <div className="grid gap-3">
      {cuotasQueMueve && (
        <p className="text-xs text-muted">
          Esta cuota arrastra el plan: vas a mover las cuotas {cuotasQueMueve.desde} a{' '}
          {cuotasQueMueve.hasta}. Todas se corren un resumen completo, en la dirección que
          elijas abajo.
        </p>
      )}

      {algunoPagado && (
        <p className="text-xs text-warn">
          El resumen que elijas ya está pagado. Podés mover el consumo igual.
        </p>
      )}

      <div className="grid gap-2">
        {vecinos.length === 0 && (
          <p className="text-xs text-muted">No hay otro resumen disponible para mover este movimiento.</p>
        )}
        {vecinos.map(({ direccion, resumen }) => (
          <Button
            key={direccion}
            type="button"
            variant="soft"
            disabled={moviendo !== null}
            onClick={() => onElegir(direccion)}
            className="min-h-[44px] w-full justify-start border-[1.5px] border-border bg-surface text-left font-normal"
          >
            Vence {corto(resumen.dueDate)}
          </Button>
        ))}
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
          onElegir={elegir}
          moviendo={moviendo}
        />
      </DialogContent>
    </Dialog>
  );
}
