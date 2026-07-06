'use client';

import { CalendarClock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { InfoHint } from '@/components/ui/info-hint';
import { useFinanceStore } from '@/lib/store/financeStore';
import { cn, formatCurrency, formatUsd } from '@/lib/utils';

export function UpcomingCardDueDatesCard({ className }: { className?: string }) {
  const router = useRouter();
  const getUpcomingCardDueDates = useFinanceStore((s) => s.getUpcomingCardDueDates);
  const { items, totalArs, totalUsd } = getUpcomingCardDueDates();

  if (items.length === 0) return null;

  const mixedCurrency = totalArs > 0 && totalUsd > 0;

  return (
    <div className={cn('rounded-2xl bg-surface border-[1.5px] border-border p-4', className)}>
      <div className="mb-3">
        <h3 className="text-sm font-bold text-text inline-flex items-center gap-1.5">
          <CalendarClock className="w-4 h-4 text-muted" />
          Lo que se viene
          <InfoHint label="Qué es lo que se viene">
            El próximo resumen de cada tarjeta: el que todavía no vence. Te muestra cuándo lo vas
            a pagar y cuánto llevás cargado. No toca tu plata de hoy y sigue sumando a medida que
            uses la tarjeta.
          </InfoHint>
        </h3>
        <p className="text-[11px] text-muted mt-0.5">Próximos resúmenes de tarjeta</p>
      </div>

      <ul className="space-y-2.5">
        {items.map((it) => (
          <li key={it.methodId}>
            <button
              type="button"
              onClick={() => router.push('/ajustes/medios')}
              aria-label={`Ver detalle de ${it.name}`}
              className="w-full flex items-center justify-between gap-3 text-left rounded-xl -mx-1 px-1 py-1 min-h-[44px] hover:bg-bg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft transition-colors"
            >
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-text truncate">{it.name}</span>
                <span className="block text-[11px] text-muted">
                  Vence {format(it.dueDate, "d 'de' MMM", { locale: es })}
                </span>
              </span>
              <span className="font-poster tnum text-[15px] text-text shrink-0 text-right">
                {it.amountUsd > 0 && it.amountArs === 0
                  ? formatUsd(it.amountUsd)
                  : formatCurrency(it.amountArs)}
                {it.amountUsd > 0 && it.amountArs > 0 && (
                  <span className="block font-poster tnum text-[11px] text-muted">{formatUsd(it.amountUsd)}</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 pt-3 border-t border-border flex items-baseline justify-between">
        <span className="text-[11px] text-muted">Total</span>
        <span className="text-right">
          <span className="font-poster tnum text-2xl text-text">
            {!mixedCurrency && totalUsd > 0 ? formatUsd(totalUsd) : formatCurrency(totalArs)}
          </span>
          {mixedCurrency && (
            <span className="block font-poster tnum text-[13px] text-muted">+ {formatUsd(totalUsd)}</span>
          )}
        </span>
      </div>

      <p className="mt-3 text-[11px] text-faint">
        Sigue sumando a medida que uses la tarjeta.
      </p>
    </div>
  );
}
