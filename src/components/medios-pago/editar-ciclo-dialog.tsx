'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CicloFechasField, type FechasDeCiclo } from './ciclo-fechas-field';
import { declararCiclo } from '@/app/medios-pago/actions';
import { declararCicloSchema } from '@/lib/schemas/ciclo';
import { useFinanceStore } from '@/lib/store/financeStore';
import type { CreditCardCycle } from '@/lib/finance/cycles';

/**
 * Corregir a mano el cierre/vencimiento del resumen vigente de una tarjeta, copiados del
 * papel del banco. `declararCiclo` (Task 3) actualiza el resumen del mismo mes calendario
 * -- nunca crea uno nuevo ni reasigna movimientos ya cargados.
 */
export function EditarCicloDialog({
  open,
  onOpenChange,
  methodId,
  ciclo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  methodId: string;
  ciclo: CreditCardCycle;
}) {
  // El store entero, no sus getters sueltos: son referencias estables y el
  // React Compiler congelaría el resultado (ver store-freshness.test.ts).
  const store = useFinanceStore();
  const router = useRouter();
  const [pendiente, setPendiente] = useState(false);
  const [fechas, setFechas] = useState<FechasDeCiclo>({
    closingDate: ciclo.closing_date,
    dueDate: ciclo.due_date,
  });

  async function guardar() {
    const input = { paymentMethodId: methodId, ...fechas };
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
    onOpenChange(false);
    await store.fetchAllData();
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Fechas del resumen</DialogTitle>
          <DialogDescription>
            Copialas del resumen del banco. No mueve ningún movimiento que ya tengas cargado.
          </DialogDescription>
        </DialogHeader>
        <CicloFechasField value={fechas} onChange={setFechas} disabled={pendiente} />
        <Button variant="accent" className="min-h-11" onClick={guardar} disabled={pendiente}>
          {pendiente ? 'Guardando…' : 'Guardar'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
