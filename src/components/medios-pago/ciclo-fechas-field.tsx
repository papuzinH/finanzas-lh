'use client';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

export type FechasDeCiclo = { closingDate: string; dueDate: string };

const PROCEDENCIA: Record<'declared' | 'generated', string> = {
  declared: 'bg-accent/10 text-accent-deep border-accent/30',
  generated: 'bg-surface-2 text-muted border-border',
};

/**
 * De donde salen las fechas de un resumen: leidas del papel del banco o estimadas por la app.
 * No es decorativo -- es lo que le dice al usuario en cual puede confiar.
 *
 * No usa <Chip> (components/ui/chip.tsx): ese componente es un boton interactivo pensado para
 * filtros/toggles (siempre con onClick) y no acepta un prop `tone` -- solo `active`. Esto es una
 * etiqueta de estado, no una accion, asi que sigue el patron de badge no interactivo que ya usa
 * el resto del repo (ver components/inversiones/asset-type-badge.tsx).
 */
export function EtiquetaProcedencia({ source }: { source: 'generated' | 'declared' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border-[1.5px]',
        PROCEDENCIA[source],
      )}
    >
      {source === 'declared' ? 'del resumen' : 'estimado'}
    </span>
  );
}

/**
 * El par cierre / vencimiento. Los valores entran y salen como string `yyyy-MM-dd`:
 * nunca pasan por Date, que en zona horaria negativa corre un dia atras.
 */
export function CicloFechasField({
  value,
  onChange,
  disabled,
}: {
  value: FechasDeCiclo;
  onChange: (v: FechasDeCiclo) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-muted">Cierre</span>
        <Input
          type="date"
          className="min-h-11"
          value={value.closingDate}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, closingDate: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-muted">Vencimiento</span>
        <Input
          type="date"
          className="min-h-11"
          value={value.dueDate}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, dueDate: e.target.value })}
        />
      </label>
    </div>
  );
}
