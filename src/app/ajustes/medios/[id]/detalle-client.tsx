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
import { DetalleDeCuenta } from './detalle-cuenta';
import type { PaymentMethod } from '@/types/database';

/** Compartido por las dos ramas (crédito y cuenta/personal): volver + nombre + tipo. */
function EncabezadoDetalle({ method }: { method: PaymentMethod }) {
  return (
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
  );
}

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

  // Cuentas de debito/efectivo y medios personales no tienen resumenes: se van a su
  // propia rama, portada tal cual del modal viejo (Task 7). Sin esto caian en el
  // "sin resumenes" de mas abajo, que es un mensaje pensado para tarjetas.
  if (method.type !== 'credit') {
    const cuenta = store.getAvailableToSpend().accounts.find((a) => a.methodId === methodId) ?? null;
    return (
      <main className="mx-auto max-w-[720px] px-5 py-6 pb-28 grid gap-5">
        <EncabezadoDetalle method={method} />
        <DetalleDeCuenta
          method={method}
          cuenta={cuenta}
          status={store.getPaymentMethodStatus(methodId)}
          transactions={store.transactions}
          paymentMethods={store.paymentMethods}
        />
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
      <EncabezadoDetalle method={method} />

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
            // key por resumen, igual que en institutional-card.tsx: EditarCicloDialog
            // inicializa `fechas` UNA sola vez, en su useState. Navegar entre resumenes
            // es router.replace sobre el mismo segmento, asi que React no remonta nada:
            // sin key, el dialogo seguiria mostrando las fechas del primer resumen que
            // se vio mientras guardar() manda el ciclo.id de las props NUEVAS -- se
            // guardaba el vencimiento de septiembre sobre el resumen de agosto, marcado
            // `declared`, y ningun realineado lo repara despues.
            <EditarCicloDialog
              key={cicloActual.id}
              open={editandoFechas}
              onOpenChange={setEditandoFechas}
              methodId={methodId}
              ciclo={cicloActual}
            />
          )}
        </>
      ) : (
        // Sin `default_closing_day` la tarjeta no tiene ciclos (asegurarCiclos la saltea
        // y el backfill la excluye), asi que no hay resumen que mostrar. Eso no la deja
        // sin movimientos: se listan por mes calendario, que es lo que hacia el modal
        // que esta pantalla reemplazo. Sin esto la pantalla era un callejon sin salida.
        // El saldo NO se muestra: para una tarjeta ese numero no es un "saldo actual" y
        // contradiria el "Al día" que la card de la lista dibuja cuando no hay ciclo.
        <>
          <p className="text-sm text-muted">
            Esta tarjeta todavía no tiene resúmenes cargados. Configurá el día de cierre y el de
            vencimiento en la ficha para que la app los pueda armar; mientras tanto, esto es lo
            que gastaste este mes.
          </p>
          <DetalleDeCuenta
            method={method}
            cuenta={null}
            status={store.getPaymentMethodStatus(methodId)}
            transactions={store.transactions}
            paymentMethods={store.paymentMethods}
            mostrarSaldo={false}
          />
        </>
      )}
    </main>
  );
}
