'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, Receipt } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFinanceStore } from '@/lib/store/financeStore';
import { payCreditCardCycle } from '@/app/compromisos/actions';
import { declararCiclo } from '@/app/medios-pago/actions';
import { ciclosDeMetodo, cicloSaldadoEn, cicloNEsimo } from '@/lib/finance/cycles';
import { DeclararProximoCiclo } from './declarar-proximo-ciclo';
import type { FechasDeCiclo } from './ciclo-fechas-field';

/**
 * Registra un pago de resumen de tarjeta (típicamente de meses anteriores) como
 * una salida real del medio elegido. Baja el saldo de ese medio y es neutro para
 * el Disponible Real global. Reversible: el pago queda como movimiento borrable.
 *
 * Este diálogo NO recibe un summary: el usuario elige tarjeta, medio, monto y
 * fecha a mano, así que el ciclo que el pago salda se resuelve con
 * `cicloSaldadoEn` (el último resumen cerrado a la fecha del pago). Elegir el
 * resumen a mano queda para más adelante.
 *
 * Dos situaciones distintas, que antes se trataban igual y bloqueaban el botón:
 * - La tarjeta NO tiene ningún resumen materializado (no tiene día de cierre ni de
 *   vencimiento cargados, así que `generarCiclos` no genera nada a propósito): el
 *   pago se registra igual, con `cycleId: null`, como eran todos antes de esta
 *   rama. Si no, esas tarjetas quedaban sin ninguna vía de registrar un pago —
 *   tampoco tienen chip en Compromisos.
 * - La tarjeta SÍ tiene resúmenes pero ninguno cerró a esa fecha: ahí sí no hay
 *   qué saldar y el envío queda deshabilitado.
 */
export function RegisterCardPaymentDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();
  // El store entero, no sus getters sueltos: son referencias estables y el
  // React Compiler congelaría el resultado (ver store-freshness.test.ts).
  const store = useFinanceStore();
  const { paymentMethods, getDefaultPaymentMethod, fetchAllData } = store;

  const creditCards = paymentMethods.filter((m) => m.type === 'credit');
  const [cardId, setCardId] = useState<string>('');
  const [fundingId, setFundingId] = useState<string>(() => {
    const def = getDefaultPaymentMethod();
    return def && def.type !== 'credit' ? String(def.id) : '';
  });
  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [fechasDeclaradas, setFechasDeclaradas] = useState<FechasDeCiclo | null>(null);

  // El medio que financia no puede ser una tarjeta de crédito ni la tarjeta pagada.
  const fundingMethods = paymentMethods.filter(
    (m) => m.type !== 'credit' && !m.is_personal && String(m.id) !== cardId
  );

  const ciclosDeLaTarjeta = ciclosDeMetodo(cardId, store.creditCardCycles);
  const cicloAPagar = date ? cicloSaldadoEn(ciclosDeLaTarjeta, date) : undefined;
  // La tarjeta no tiene resúmenes cargados en absoluto: el pago va sin ciclo.
  const sinCiclosCargados = Boolean(cardId) && ciclosDeLaTarjeta.length === 0;
  // Tiene resúmenes, pero ninguno cerrado a esa fecha: no hay qué saldar.
  const sinResumen = Boolean(cardId) && Boolean(date) && !cicloAPagar && !sinCiclosCargados;
  // El resumen que sigue al que se está saldando: es donde se le ofrece al usuario
  // declarar las fechas reales (paso opcional, ver DeclararProximoCiclo).
  const cicloSiguienteAPagar = cicloAPagar
    ? cicloNEsimo(ciclosDeLaTarjeta, cicloAPagar, 1)
    : undefined;

  // Tarjeta Y fecha recalculan cual es "el resumen siguiente" (L74-84). Si cualquiera
  // de los dos ejes lo cambia mientras el usuario ya habia declarado fechas para el
  // resumen anterior, esa declaracion queda apuntando a un resumen que la UI ya no
  // muestra ni deja corregir -- se invalida ante cualquier cambio de identidad del
  // resumen siguiente, sin depender de que cada input que lo afecte se acuerde de
  // resetear a mano.
  useEffect(() => {
    setFechasDeclaradas(null);
  }, [cicloSiguienteAPagar?.id]);

  async function onSubmit() {
    const card = creditCards.find((m) => String(m.id) === cardId);
    const funding = fundingMethods.find((m) => String(m.id) === fundingId);
    const amountArs = Number(amount);

    if (!card) return toast.error('Elegí la tarjeta');
    if (!funding) return toast.error('Elegí con qué medio pagaste');
    if (!amountArs || amountArs <= 0) return toast.error('Ingresá un monto válido');
    if (!date) return toast.error('Elegí la fecha del pago');
    if (!cicloAPagar && !sinCiclosCargados) return toast.error('Sin resumen cargado para esa fecha');

    setIsPending(true);
    try {
      const res = await payCreditCardCycle({
        cardMethodId: card.id,
        fundingMethodId: funding.id,
        amountArs,
        date,
        cardName: card.name,
        cycleId: cicloAPagar?.id ?? null,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }

      // El pago es lo que el usuario vino a hacer: va primero. Declarar el proximo
      // resumen es secundario y solo si el usuario abrio el paso (fechasDeclaradas)
      // Y ese resumen siguiente existe -- si nunca lo abrio, fechasDeclaradas es
      // null y la estimacion sigue siendo estimacion. Un fallo aca no deshace el
      // pago ni se reporta como error: se avisa con un toast.
      if (fechasDeclaradas && cicloSiguienteAPagar) {
        const d = await declararCiclo({
          paymentMethodId: card.id,
          // El resumen exacto que mostro el paso: sin el id, la escritura lo resuelve por
          // mes calendario y con cierres cerca del borde de mes apunta al de al lado.
          cycleId: cicloSiguienteAPagar.id,
          closingDate: fechasDeclaradas.closingDate,
          dueDate: fechasDeclaradas.dueDate,
        });
        if (d.error) {
          toast.warning('Registramos el pago, pero no pudimos guardar las fechas: ' + d.error);
        }
      }

      toast.success(`Pago de ${card.name} registrado en ${funding.name}`);
      setOpen(false);
      setAmount('');
      setCardId('');
      setFechasDeclaradas(null);
      await fetchAllData();
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="soft" size="sm" className="gap-1.5">
          <Receipt className="h-4 w-4" />
          Registrar pago
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton
        className="max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0 sm:max-w-[460px] bg-surface border-[1.5px] border-border text-text"
      >
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="font-display text-text text-[18px]">
            Registrar pago de tarjeta
          </DialogTitle>
          <p className="text-sm text-muted mt-1">
            Registrá un pago (incluso de meses anteriores). Baja el saldo del medio con
            el que pagaste; no cambia tu Disponible Real.
          </p>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-6 pb-4 space-y-5">
          {/* Tarjeta pagada */}
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
              Tarjeta
            </span>
            <Select value={cardId} onValueChange={setCardId}>
              <SelectTrigger className="w-full min-h-11 mt-1">
                <SelectValue placeholder="Elegí la tarjeta" />
              </SelectTrigger>
              <SelectContent>
                {creditCards.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Medio con el que se pagó */}
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
              ¿Con qué medio pagaste?
            </span>
            <Select value={fundingId} onValueChange={setFundingId}>
              <SelectTrigger className="w-full min-h-11 mt-1">
                <SelectValue placeholder="Elegí un medio" />
              </SelectTrigger>
              <SelectContent>
                {fundingMethods.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Monto */}
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
              Monto pagado (ARS)
            </span>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              placeholder="Ej: 120000"
              className="min-h-11 mt-1 tnum"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {/* Fecha */}
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
              Fecha del pago
            </span>
            <Input
              type="date"
              className="min-h-11 mt-1"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            {sinResumen && (
              <p className="text-sm text-muted mt-1">Sin resumen cargado para esa fecha</p>
            )}
          </div>

          {cicloSiguienteAPagar && (
            <DeclararProximoCiclo
              key={cicloSiguienteAPagar.id}
              methodId={cardId}
              estimado={{
                closingDate: cicloSiguienteAPagar.closing_date,
                dueDate: cicloSiguienteAPagar.due_date,
              }}
              onDeclarar={setFechasDeclaradas}
            />
          )}
        </div>

        <div className="px-6 pb-6 pt-3 shrink-0">
          <Button
            type="button"
            onClick={onSubmit}
            disabled={isPending || sinResumen}
            variant="accent"
            size="lg"
            className="w-full"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Registrando...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-5 w-5" />
                Registrar pago
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
