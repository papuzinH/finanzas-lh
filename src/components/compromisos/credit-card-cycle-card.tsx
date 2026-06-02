'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CreditCard, Check, Clock, Loader2, ChevronRight } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
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
  const { markCreditCardCyclePaid } = useFinanceStore();

  if (!card.isPending) {
    return (
      <Badge className="gap-1 bg-emerald-900/40 text-emerald-400 border-emerald-800 hover:bg-emerald-900/40 cursor-default select-none">
        <Check className="h-3 w-3" />
        Pagada
      </Badge>
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
      <Badge
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }}
        className="gap-1 bg-amber-900/40 text-amber-400 border-amber-800 hover:bg-amber-900/50 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        <Clock className="h-3 w-3" />
        Pendiente
        <ChevronRight className="h-3 w-3" />
      </Badge>

      <AlertDialog open={open} onOpenChange={(v) => !confirming && setOpen(v)}>
        <AlertDialogContent className="bg-surface-overlay border-slate-800 text-slate-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              ¿Ya pagaste la {card.name}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {formatCurrency(card.total)}
              {card.totalUSD && ` + u$s ${card.totalUSD.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              {' · vence '}{formattedDate}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel
              disabled={confirming}
              className="w-full sm:w-auto h-11 sm:h-9 text-slate-400 hover:text-white hover:bg-slate-800 border-slate-700 bg-transparent"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirm(); }}
              disabled={confirming}
              className="w-full sm:w-auto h-11 sm:h-9 bg-indigo-600 hover:bg-indigo-700 text-white border-0"
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
    <Card className="border-slate-800 bg-[var(--surface-raised)] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-900/40">
            <CreditCard className="h-5 w-5 text-indigo-400" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-slate-100 truncate">{card.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Ciclo actual · vence {formattedDate}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <CreditCardCycleChip card={card} formattedDate={formattedDate} />
          <p className={card.isPending ? 'text-lg font-bold text-rose-400' : 'text-lg font-bold text-white'}>
            {formatCurrency(card.total)}
          </p>
          {card.totalUSD && (
            <p className="text-xs text-slate-400">
              u$s {card.totalUSD.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} en USD
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
