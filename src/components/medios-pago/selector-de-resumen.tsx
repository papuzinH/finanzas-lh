'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/utils/dates';
import type { EstadoDeResumen, ResumenNavegable } from '@/lib/finance/detalle-resumen';

export const ETIQUETA_ESTADO: Record<EstadoDeResumen, string> = {
  proyectado: 'Proyectado',
  pendiente: 'Pendiente',
  vencido: 'Vencido',
  pagado: 'Pagado',
};

const mesCorto = (d: string) => format(parseLocalDate(d), 'd MMM', { locale: es });

/**
 * La etiqueta del pill: lo MINIMO que alcanza para no confundir dos resúmenes.
 *
 * Se compara mes **y** año, no el nombre del mes solo. Con el nombre solo, una cuenta
 * real -- el backfill materializa ~26 resúmenes, de 2025-08 a 2027-09 -- tiene cada
 * nombre repetido dos o tres veces, así que el "hay homónimo" daba SIEMPRE true y el
 * pill mostraba siempre la fecha completa ("20 ago 2026"), incluso en la tarjeta con
 * un resumen por mes para la que se diseñó.
 *
 * Tres niveles, porque los dos choques son distintos:
 * - otro resumen cierra el MISMO mes y año (declarar produce exactamente eso, y la
 *   unique es (payment_method_id, closing_date)) -> hace falta el día: "20 ago 2026".
 * - sólo se repite el nombre del mes, en otro año -> alcanza el año: "agosto 2026".
 *   Bajar esto a "agosto" a secas volvería a hacer ambiguo el pill de una cuenta con
 *   más de un año de historia, que es la cuenta normal después del backfill.
 * - nada se repite -> el mes solo: "agosto".
 */
export function etiquetaDeResumen(actual: ResumenNavegable, resumenes: ResumenNavegable[]): string {
  const fecha = parseLocalDate(actual.closingDate);
  const otros = resumenes.filter((r) => r.id !== actual.id).map((r) => parseLocalDate(r.closingDate));

  const chocaMesYAno = otros.some(
    (d) => d.getMonth() === fecha.getMonth() && d.getFullYear() === fecha.getFullYear(),
  );
  if (chocaMesYAno) return format(fecha, 'd MMM yyyy', { locale: es });

  const chocaSoloElNombre = otros.some((d) => d.getMonth() === fecha.getMonth());
  return format(fecha, chocaSoloElNombre ? 'MMMM yyyy' : 'MMMM', { locale: es });
}

/**
 * Navegacion entre RESUMENES, no entre meses: dos resumenes pueden vencer en el mismo
 * mes calendario (declarar produce exactamente eso), asi que un picker de meses no
 * puede representarlos. Se copia la forma de MonthSelector, no el componente.
 */
export function SelectorDeResumen({
  resumenes,
  actualId,
  onSelect,
}: {
  resumenes: ResumenNavegable[];
  actualId: string;
  onSelect: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const i = resumenes.findIndex((r) => r.id === actualId);
  const actual = resumenes[i];
  if (!actual) return null;

  const etiqueta = etiquetaDeResumen(actual, resumenes);

  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        aria-label="Resumen anterior"
        disabled={i <= 0}
        onClick={() => onSelect(resumenes[i - 1].id)}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border-[1.5px] border-border text-muted disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full border-[1.5px] border-border bg-surface-2 px-4"
      >
        <span className="font-display text-base capitalize text-text">{etiqueta}</span>
        <ChevronDown className="h-4 w-4 text-muted" />
      </button>

      <button
        type="button"
        aria-label="Resumen siguiente"
        disabled={i >= resumenes.length - 1}
        onClick={() => onSelect(resumenes[i + 1].id)}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border-[1.5px] border-border text-muted disabled:opacity-40"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-[380px] bg-surface border-border text-text p-5">
          <DialogHeader className="px-1 pt-1 pb-2">
            <DialogTitle className="text-sm font-bold text-muted">Elegir resumen</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto grid gap-1.5">
            {[...resumenes].reverse().map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => { onSelect(r.id); setAbierto(false); }}
                className={cn(
                  'flex min-h-[44px] items-center justify-between rounded-xl border-[1.5px] px-3 text-left',
                  r.id === actual.id ? 'border-accent-deep bg-accent/10' : 'border-border bg-surface-2',
                )}
              >
                <span className="text-sm text-text">
                  Cierra {mesCorto(r.closingDate)} · vence {mesCorto(r.dueDate)}
                </span>
                <span className="text-[10px] uppercase text-muted">{ETIQUETA_ESTADO[r.estado]}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
