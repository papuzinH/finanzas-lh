'use client';

import { useState } from 'react';
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

/**
 * Registra un pago de resumen de tarjeta (típicamente de meses anteriores) como
 * una salida real del medio elegido. Baja el saldo de ese medio y es neutro para
 * el Disponible Real global. Reversible: el pago queda como movimiento borrable.
 */
export function RegisterCardPaymentDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();
  const { paymentMethods, getDefaultPaymentMethod, fetchAllData } = useFinanceStore();

  const creditCards = paymentMethods.filter((m) => m.type === 'credit');
  const [cardId, setCardId] = useState<string>('');
  const [fundingId, setFundingId] = useState<string>(() => {
    const def = getDefaultPaymentMethod();
    return def && def.type !== 'credit' ? String(def.id) : '';
  });
  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));

  // El medio que financia no puede ser una tarjeta de crédito ni la tarjeta pagada.
  const fundingMethods = paymentMethods.filter(
    (m) => m.type !== 'credit' && !m.is_personal && String(m.id) !== cardId
  );

  async function onSubmit() {
    const card = creditCards.find((m) => String(m.id) === cardId);
    const funding = fundingMethods.find((m) => String(m.id) === fundingId);
    const amountArs = Number(amount);

    if (!card) return toast.error('Elegí la tarjeta');
    if (!funding) return toast.error('Elegí con qué medio pagaste');
    if (!amountArs || amountArs <= 0) return toast.error('Ingresá un monto válido');
    if (!date) return toast.error('Elegí la fecha del pago');

    setIsPending(true);
    try {
      const res = await payCreditCardCycle({
        cardMethodId: card.id,
        fundingMethodId: funding.id,
        amountArs,
        date,
        cardName: card.name,
      });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`Pago de ${card.name} registrado en ${funding.name}`);
        setOpen(false);
        setAmount('');
        setCardId('');
        await fetchAllData();
        router.refresh();
      }
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
          <DialogTitle className="font-poster text-text text-[18px]">
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
          </div>
        </div>

        <div className="px-6 pb-6 pt-3 shrink-0">
          <Button
            type="button"
            onClick={onSubmit}
            disabled={isPending}
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
