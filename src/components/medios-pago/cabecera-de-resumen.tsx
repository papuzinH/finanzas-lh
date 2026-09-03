'use client';

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { cn, formatCurrency, formatUsd } from '@/lib/utils';
import { parseLocalDate } from '@/lib/utils/dates';
import { EtiquetaProcedencia } from './ciclo-fechas-field';
import { ETIQUETA_ESTADO } from './selector-de-resumen';
import type { ResumenNavegable } from '@/lib/finance/detalle-resumen';

const corto = (d: string) => format(parseLocalDate(d), 'd MMM', { locale: es });

const TONO_ESTADO: Record<ResumenNavegable['estado'], string> = {
  proyectado: 'text-muted',
  pendiente: 'text-warn',
  vencido: 'text-bad',
  pagado: 'text-good',
};

/**
 * Lo que se cotea contra el papel del banco: las dos fechas con su procedencia, el
 * total, el estado, y la via para declarar las fechas reales -- estar con el resumen
 * enfrente es el mejor momento para hacerlo.
 */
export function CabeceraDeResumen({
  resumen,
  deuda,
  totalARS,
  totalUSD,
  onCorregirFechas,
}: {
  resumen: ResumenNavegable;
  deuda: number;
  totalARS: number;
  totalUSD: number;
  onCorregirFechas: () => void;
}) {
  const alDia = deuda <= 0;
  const mainAmount = alDia
    ? null
    : totalARS > 0
      ? formatCurrency(totalARS)
      : totalUSD > 0
        ? formatUsd(totalUSD)
        : formatCurrency(deuda);

  return (
    <div className="rounded-2xl border-[1.5px] border-border bg-surface p-5 grid gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="text-sm text-text">
            Cierra {corto(resumen.closingDate)} · vence {corto(resumen.dueDate)}
          </p>
          <EtiquetaProcedencia source={resumen.source} />
        </div>
        <span className={cn('text-[10px] font-semibold uppercase tracking-wide', TONO_ESTADO[resumen.estado])}>
          {ETIQUETA_ESTADO[resumen.estado]}
        </span>
      </div>

      <div className="pr-3 pb-2">
        {alDia ? (
          <p
            data-testid="total-resumen"
            className="font-display tnum text-3xl leading-[var(--leading-display)] text-good [text-shadow:var(--shadow-bandera)] min-w-0 truncate pr-1.5 pb-1"
          >
            Al día
          </p>
        ) : (
          <p
            data-testid="total-resumen"
            className="font-display tnum text-3xl leading-[var(--leading-display)] text-text [text-shadow:var(--shadow-bandera)] min-w-0 truncate pr-1.5 pb-1"
          >
            {mainAmount}
          </p>
        )}
        {!alDia && totalARS > 0 && totalUSD > 0 && (
          <p className="font-display tnum mt-1 text-sm text-muted">+ {formatUsd(totalUSD)}</p>
        )}
      </div>

      {resumen.estado === 'proyectado' && (
        <p className="text-xs text-muted">
          Este resumen todavía no cerró: solo trae lo que ya está comprometido (cuotas y
          mensualidades), no lo que gastes de acá al cierre.
        </p>
      )}

      <Button variant="soft" className="min-h-[44px] justify-self-start" onClick={onCorregirFechas}>
        Corregir fechas
      </Button>
    </div>
  );
}
