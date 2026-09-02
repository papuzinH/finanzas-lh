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

const mesDe = (d: string) => format(parseLocalDate(d), 'MMMM', { locale: es });
const mesCorto = (d: string) => format(parseLocalDate(d), 'd MMM', { locale: es });

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

  // Si otro resumen cierra en el mismo mes calendario, el mes solo no alcanza.
  const mes = mesDe(actual.closingDate);
  const hayHomonimo = resumenes.some((r) => r.id !== actual.id && mesDe(r.closingDate) === mes);
  const etiqueta = hayHomonimo
    ? `${mes} ${format(parseLocalDate(actual.closingDate), 'd')}`
    : mes;

  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        aria-label="Resumen anterior"
        disabled={i <= 0}
        onClick={() => onSelect(resumenes[i - 1].id)}
        className={cn(
          'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border-[1.5px] border-border text-muted',
          i <= 0 && 'opacity-40',
        )}
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
        className={cn(
          'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border-[1.5px] border-border text-muted',
          i >= resumenes.length - 1 && 'opacity-40',
        )}
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
