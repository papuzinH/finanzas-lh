'use client';

import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency, formatUsd } from '@/lib/utils';
import { goalsHeadline } from '@/lib/utils/objetivos-copy';
import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Chancho } from '@/components/brand/chancho';

/**
 * La entrada de /objetivos: cuánto llevás guardado entre todas tus metas.
 *
 * Existe porque la pantalla no podía responder su pregunta más obvia —«¿cuánto
 * llevo?»— sin que el usuario sumara las cards a ojo, y porque era la única
 * pantalla de la app que arrancaba directo con una lista: Inicio abre con «Tu
 * plata libre para hoy» e Inversiones con «Tu cartera», las dos con una cifra
 * grande y la firma celeste. Esta es la de Objetivos, y **la única de la
 * pantalla que lleva `--shadow-bandera`**, como manda el sistema.
 */
export function GoalsHeroCard() {
  // El store entero, no sus getters sueltos (ver store-freshness.test.ts).
  const store = useFinanceStore();
  const { totalSavedARS, totalTargetARS, percent, remainingARS, activeCount, totalsByCurrency } =
    store.getSavingsGoalsOverview();

  if (activeCount === 0) return null;

  // Si todo lo ahorrado está en una sola moneda, se muestra en esa moneda: convertir
  // dólares a pesos para después decir "US$" sería mentir sobre lo que hay.
  // Sin centavos: es una cifra de titular, no un extracto.
  const soloUsd = totalsByCurrency.USD !== null && totalsByCurrency.ARS === null;
  const cifra = soloUsd
    ? formatUsd(Math.round(totalsByCurrency.USD!)).replace(',00', '')
    : formatCurrency(Math.round(totalSavedARS)).replace(',00', '');

  return (
    <Card className="relative overflow-hidden p-4 grid gap-1.5">
      <span className="font-sans text-[11px] font-extrabold uppercase tracking-[0.13em] text-muted">
        Guardado para tus metas
      </span>

      <span className="font-display tnum text-[38px] leading-[var(--leading-display)] text-text [text-shadow:var(--shadow-bandera)] min-w-0 truncate pr-1.5 pb-1">
        {cifra}
      </span>

      <span className="font-sans text-[12.5px] text-muted tnum">
        {goalsHeadline({ percent, remainingARS, activeCount })}
      </span>

      {totalTargetARS > 0 && (
        <div className="mt-1.5">
          <ProgressBar
            value={percent}
            tone={percent >= 100 ? 'good' : 'accent'}
            height={7}
            label={`Progreso de todas tus metas: ${Math.round(percent)}%`}
          />
        </div>
      )}

      {/* Marca de agua: el chancho asomando en la esquina, apenas visible. */}
      <Chancho
        className="pointer-events-none absolute -right-5 -bottom-4 w-[118px] text-text opacity-[0.07]"
        slot="var(--surface)"
      />
    </Card>
  );
}
