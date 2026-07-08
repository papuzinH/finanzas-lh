'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CreditCard, Check, Clock, Loader2, Undo2, AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { useFinanceStore, CreditCardCycleSummary } from '@/lib/store/financeStore';
import { payCreditCardCycle, undoCreditCardPayment } from '@/app/compromisos/actions';
import { formatCurrency } from '@/lib/utils';

interface CreditCardCycleChipProps {
  card: CreditCardCycleSummary;
  formattedDate: string;
}

export function CreditCardCycleChip({ card, formattedDate }: CreditCardCycleChipProps) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();
  const { getPaymentMethodStatus, paymentMethods, getDefaultPaymentMethod, fetchAllData } = useFinanceStore();
  const status = getPaymentMethodStatus(card.methodId);
  const cycleNotClosedYet =
    status.nextClosingDate !== undefined && new Date() < status.nextClosingDate;
  const closingDateLabel = status.nextClosingDate
    ? format(status.nextClosingDate, "d 'de' MMM", { locale: es })
    : '';

  // Medios que pueden financiar el pago (todos menos la propia tarjeta y los personales).
  const fundingMethods = paymentMethods.filter((m) => m.id !== card.methodId && !m.is_personal);
  const [fundingId, setFundingId] = useState<string>(() => {
    const def = getDefaultPaymentMethod();
    return def && def.id !== card.methodId ? String(def.id) : '';
  });

  const refresh = async () => {
    await fetchAllData();
    router.refresh();
  };

  if (!card.isPending) {
    const handleUndo = async () => {
      setConfirming(true);
      try {
        const res = await undoCreditCardPayment({
          cardMethodId: card.methodId,
          year: card.nextPaymentDate.getFullYear(),
          month: card.nextPaymentDate.getMonth(),
        });
        if (res.error) {
          toast.error(res.error);
        } else {
          toast.success('Pago deshecho');
          await refresh();
        }
      } finally {
        setConfirming(false);
        setOpen(false);
      }
    };

    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Deshacer pago de ${card.name}`}
          className="inline-flex items-center gap-1 min-h-11 px-3 rounded-full text-[11px] font-bold bg-good/10 text-good border border-good/20 cursor-pointer select-none hover:bg-good/15 transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Pagada
          <Undo2 className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
        </button>

        <AlertDialog open={open} onOpenChange={(v) => !confirming && setOpen(v)}>
          <AlertDialogContent className="bg-surface border-[1.5px] border-border text-text">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-poster text-[18px]">
                ¿Deshacer pago de {card.name}?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-muted">
                Se borrará la salida registrada y la tarjeta volverá a pendiente (vence el {formattedDate}).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel disabled={confirming} className="w-full sm:w-auto">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); handleUndo(); }}
                disabled={confirming}
                className="w-full sm:w-auto"
              >
                {confirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sí, deshacer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  const handleConfirm = async () => {
    const fundingMethod = fundingMethods.find((m) => String(m.id) === fundingId);
    if (!fundingMethod) {
      toast.error('Elegí con qué medio pagás');
      return;
    }
    setConfirming(true);
    try {
      const res = await payCreditCardCycle({
        cardMethodId: card.methodId,
        fundingMethodId: fundingMethod.id,
        amountArs: card.total,
        date: format(card.nextPaymentDate, 'yyyy-MM-dd'),
        cardName: card.name,
      });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`Pago registrado en ${fundingMethod.name}`);
        await refresh();
        setOpen(false);
      }
    } finally {
      setConfirming(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Registrar pago de ${card.name}`}
        className="inline-flex items-center gap-1 min-h-11 px-3 rounded-full text-[11px] font-bold bg-warn/10 text-warn border border-warn/20 cursor-pointer select-none hover:bg-warn/15 transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        Pendiente
      </button>

      <AlertDialog open={open} onOpenChange={(v) => !confirming && setOpen(v)}>
        <AlertDialogContent className="bg-surface border-[1.5px] border-border text-text">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-poster text-[18px]">
              ¿Ya pagaste la {card.name}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted">
              {card.totalARS > 0 && formatCurrency(card.totalARS)}
              {card.totalARS > 0 && card.totalUSD > 0 && ' + '}
              {card.totalUSD > 0 && `u$s ${card.totalUSD.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              {card.totalARS === 0 && card.totalUSD === 0 && formatCurrency(card.total)}
              {' · vence '}{formattedDate}
            </AlertDialogDescription>
            {cycleNotClosedYet && (
              <p className="mt-2 text-[12px] text-warn flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  El resumen todavía no cerró (cierra el {closingDateLabel}). Compras nuevas hasta
                  esa fecha se restarán de tu Disponible Real al instante.
                </span>
              </p>
            )}
          </AlertDialogHeader>

          {/* Selector del medio con el que se paga (de ahí sale la plata) */}
          <div className="py-1">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted mb-1.5">
              ¿Con qué medio pagás?
            </p>
            <Select value={fundingId} onValueChange={setFundingId}>
              <SelectTrigger className="w-full min-h-11">
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

          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={confirming} className="w-full sm:w-auto">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirm(); }}
              disabled={confirming || !fundingId}
              className="w-full sm:w-auto"
            >
              {confirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sí, ya la pagué
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface CreditCardCycleCardProps {
  card: CreditCardCycleSummary;
}

export function CreditCardCycleCard({ card }: CreditCardCycleCardProps) {
  const formattedDate = format(card.nextPaymentDate, "d 'de' MMM", { locale: es });

  return (
    <Card className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-xl bg-surface-2 border-[1.5px] border-border">
            <CreditCard className="h-4 w-4 text-muted" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="font-sans font-bold text-text truncate">{card.name}</p>
            <p className="text-[11px] text-muted mt-0.5">
              Ciclo actual · vence {formattedDate}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <CreditCardCycleChip card={card} formattedDate={formattedDate} />
          <div className="flex flex-col items-end gap-0.5">
            {card.totalARS > 0 && (
              <p className={`font-poster tnum text-[15px] leading-none ${card.isPending ? 'text-bad' : 'text-muted'}`}>
                {formatCurrency(card.totalARS)}
              </p>
            )}
            {card.totalUSD > 0 && (
              <p className={`font-poster tnum text-[15px] leading-none ${card.isPending ? 'text-bad' : 'text-muted'}`}>
                u$s {card.totalUSD.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            )}
            {card.totalARS === 0 && card.totalUSD === 0 && (
              <p className={`font-poster tnum text-[15px] leading-none ${card.isPending ? 'text-bad' : 'text-muted'}`}>
                {formatCurrency(card.total)}
              </p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
