'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { FullPageLoader } from '@/components/shared/loader';
import { SelectorDeResumen } from '@/components/medios-pago/selector-de-resumen';
import { CabeceraDeResumen } from '@/components/medios-pago/cabecera-de-resumen';
import { FilasDelResumen } from '@/components/medios-pago/filas-del-resumen';
import { EditarCicloDialog } from '@/components/medios-pago/editar-ciclo-dialog';

export function DetalleClient({ methodId }: { methodId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // El store ENTERO: sus getters son referencias estables y el React Compiler
  // congelaria el resultado si se desestructuraran (store-freshness.test.ts).
  const store = useFinanceStore();
  const [editandoFechas, setEditandoFechas] = useState(false);

  // Acciones y campos de estado sí se desestructuran (CLAUDE.md); lo que no se toca
  // suelto son los getters de cálculo. store.fetchAllData hace un `set` sincrónico
  // antes de fijar isInitialized: con `[store]` como dep, ese set cambia la
  // referencia del store, el efecto se re-dispara, isInitialized sigue en false y
  // dispara otro fetchAllData -- una cascada de invocaciones concurrentes.
  const { isInitialized, fetchAllData } = store;
  useEffect(() => {
    if (!isInitialized) fetchAllData();
  }, [isInitialized, fetchAllData]);

  if (store.isLoading && !store.isInitialized) {
    return <FullPageLoader text="Cargando movimientos..." />;
  }

  const method = store.paymentMethods.find((m) => m.id === methodId);
  if (!method) {
    return (
      <main className="mx-auto max-w-[720px] px-5 py-6">
        <p className="text-sm text-muted">Ese medio de pago no existe.</p>
        <Link href="/ajustes/medios" className="text-sm text-accent-deep underline">
          Volver a la billetera
        </Link>
      </main>
    );
  }

  const detalle = store.getCardCycleDetail(methodId, searchParams.get('resumen') ?? undefined);

  // Navegar entre resumenes no debe llenar el historial: replace, no push.
  const irA = (cycleId: string) =>
    router.replace(`/ajustes/medios/${methodId}?resumen=${cycleId}`, { scroll: false });

  // Se guarda el id en una variable propia: el narrowing de `detalle.actual` no
  // sobrevive dentro del callback de `.find` (TS no lo garantiza a través de un
  // cierre), así que se necesitaba el `!` o, mejor, este paso intermedio.
  const actualId = detalle?.actual?.id;
  const cicloActual = actualId
    ? store.creditCardCycles.find((c) => c.id === actualId)
    : undefined;

  return (
    <main className="mx-auto max-w-[720px] px-5 py-6 pb-28 grid gap-5">
      <div className="flex items-center gap-3">
        <Link
          href="/ajustes/medios"
          aria-label="Volver a la billetera"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border-[1.5px] border-border text-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-display text-xl text-text">{method.name}</h1>
          <p className="text-xs uppercase tracking-widest text-muted">
            {method.type === 'credit' ? 'Tarjeta de crédito' : 'Cuenta / Efectivo'}
          </p>
        </div>
      </div>

      {detalle && detalle.actual ? (
        <>
          <SelectorDeResumen
            resumenes={detalle.resumenes}
            actualId={detalle.actual.id}
            onSelect={irA}
          />
          <CabeceraDeResumen
            resumen={detalle.actual}
            deuda={detalle.deuda}
            totalARS={detalle.totalARS}
            totalUSD={detalle.totalUSD}
            onCorregirFechas={() => setEditandoFechas(true)}
          />
          <FilasDelResumen filas={detalle.filas} />
          {cicloActual && (
            <EditarCicloDialog
              open={editandoFechas}
              onOpenChange={setEditandoFechas}
              methodId={methodId}
              ciclo={cicloActual}
            />
          )}
        </>
      ) : (
        <p className="text-sm text-muted">
          Esta tarjeta todavía no tiene resúmenes cargados. Configurá el día de cierre y el de
          vencimiento en la ficha para que la app los pueda armar.
        </p>
      )}
    </main>
  );
}
