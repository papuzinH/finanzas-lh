'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CicloFechasField, type FechasDeCiclo } from '@/components/medios-pago/ciclo-fechas-field';
import { declararCiclo, posponerRecordatorioDeCiclo } from '@/app/medios-pago/actions';
import { declararCicloSchema } from '@/lib/schemas/ciclo';
import { useFinanceStore } from '@/lib/store/financeStore';
import type { CreditCardCycle } from '@/lib/finance/cycles';

/**
 * El recordatorio de declarar las fechas del resumen, el dia en que ese resumen cierra -- que
 * es cuando el banco emite el papel (Ley 25.065 art. 23): pedirlo antes seria pedir un dato
 * que el usuario todavia no puede tener. `ciclosQuePidenDeclaracion` (lib/finance/cycles.ts)
 * decide cuales mostrar.
 *
 * "Ahora no" persiste en la base (`reminder_dismissed_at`, via `posponerRecordatorioDeCiclo`),
 * no en localStorage: la app se abre en el telefono y en la compu, y en localStorage el aviso
 * reaparece una vez por dispositivo -- la leccion del tour, que el popup de novedades ya
 * resolvio poniendo el estado en la base.
 *
 * No usa <BannerDS> (components/ui/banner-ds.tsx): ese componente no acepta children ni un
 * onClick en su `cta` -- es un banner de solo lectura. Este necesita alojar el formulario
 * (CicloFechasField) cuando el usuario elige cargar las fechas, asi que sigue el patron de
 * banner interactivo que ya usan OverdueCardPaymentBanner/IncompleteCreditCardsBanner: markup
 * propio con los mismos tokens `warn`.
 */
export function RecordatorioDeclararCiclo({
  ciclo,
  nombreTarjeta,
}: {
  ciclo: CreditCardCycle;
  nombreTarjeta: string;
}) {
  // El store entero, no sus getters sueltos: son referencias estables y el
  // React Compiler congelaría el resultado (ver store-freshness.test.ts).
  const store = useFinanceStore();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, setPendiente] = useState(false);
  const [fechas, setFechas] = useState<FechasDeCiclo>({
    closingDate: ciclo.closing_date,
    dueDate: ciclo.due_date,
  });

  async function refrescar() {
    await store.fetchAllData();
    router.refresh();
  }

  async function guardar() {
    const input = { paymentMethodId: ciclo.payment_method_id, ...fechas };
    const parsed = declararCicloSchema.safeParse(input);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    setPendiente(true);
    const r = await declararCiclo(parsed.data);
    setPendiente(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    toast.success('Listo, guardamos las fechas de tu resumen');
    await refrescar();
  }

  async function posponer() {
    setPendiente(true);
    const r = await posponerRecordatorioDeCiclo(ciclo.id);
    setPendiente(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    await refrescar();
  }

  return (
    <div className="relative rounded-xl border-[1.5px] border-warn/40 bg-warn/10 p-4 flex items-start gap-3">
      <div className="rounded-lg bg-warn/15 p-2 shrink-0">
        <CalendarClock className="h-4 w-4 text-warn" aria-hidden="true" />
      </div>

      <div className="flex-1 min-w-0 grid gap-2">
        <div>
          <p className="text-sm font-bold font-sans text-text">
            Cerró el resumen de {nombreTarjeta}
          </p>
          <p className="text-xs text-muted mt-0.5">
            ¿Tenés las fechas a mano? Copialas del resumen del banco.
          </p>
        </div>

        {abierto ? (
          <div className="flex flex-col gap-2">
            <CicloFechasField value={fechas} onChange={setFechas} disabled={pendiente} />
            <Button
              type="button"
              variant="accent"
              className="min-h-11 self-start"
              onClick={guardar}
              disabled={pendiente}
            >
              {pendiente ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="soft"
              className="min-h-11"
              onClick={() => setAbierto(true)}
              disabled={pendiente}
            >
              Cargar fechas
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={posponer}
              disabled={pendiente}
            >
              Ahora no
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
