'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CreditCard, Check, Clock, Loader2, Undo2 } from 'lucide-react';
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
import { Card } from '@/components/ui/card';
import { useFinanceStore, CreditCardCycleSummary } from '@/lib/store/financeStore';
import { formatCurrency } from '@/lib/utils';

interface CreditCardCycleChipProps {
  card: CreditCardCycleSummary;
  formattedDate: string;
}

export function CreditCardCycleChip({ card, formattedDate }: CreditCardCycleChipProps) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { markCreditCardCyclePaid, unmarkCreditCardCyclePaid } = useFinanceStore();

  if (!card.isPending) {
    return (
      <>
        <span
          role="button"
          tabIndex={0}
          onClick={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-good/10 text-good border border-good/20 cursor-pointer select-none hover:bg-good/15 transition-colors"
        >
          <Check className="h-3 w-3" />
          Pagada
          <Undo2 className="h-3 w-3 opacity-60" />
        </span>

        <AlertDialog open={open} onOpenChange={(v) => !confirming && setOpen(v)}>
          <AlertDialogContent className="bg-surface border-[1.5px] border-border text-text">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-poster text-[18px]">
                ¿Deshacer pago de {card.name}?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-muted">
                La tarjeta volverá al estado pendiente para el ciclo que vence el {formattedDate}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel disabled={confirming} className="w-full sm:w-auto">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  setConfirming(true);
                  try {
                    unmarkCreditCardCyclePaid(card.methodId);
                  } finally {
                    setConfirming(false);
                    setOpen(false);
                  }
                }}
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
    setConfirming(true);
    try {
      markCreditCardCyclePaid(card.methodId);
    } finally {
      setConfirming(false);
      setOpen(false);
    }
  };

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-warn/10 text-warn border border-warn/20 cursor-pointer select-none hover:bg-warn/15 transition-colors"
      >
        <Clock className="h-3 w-3" />
        Pendiente
      </span>

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
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={confirming} className="w-full sm:w-auto">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirm(); }}
              disabled={confirming}
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
            <CreditCard className="h-4 w-4 text-muted" />
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
