import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * El bloque que ocupa el lugar de una lista que todavía no tiene nada.
 *
 * Existe porque el estado vacío fue lo único que quedó afuera del rediseño de
 * layouts: diez copias del mismo `<div>` repartidas en siete pantallas, cada una
 * con un ícono de lucide de 56px en gris flotando sobre `py-14`. Dos de esos
 * apilados —el caso real de /objetivos sin metas ni presupuestos— dejaban la
 * pantalla convertida en dos rectángulos punteados casi idénticos.
 *
 * Dos decisiones sobre lo que había:
 * - **`py-8` (32px), no 56.** El `.empty` de los mocks de la identidad usa 26px;
 *   el bloque estaba al doble de lo diseñado.
 * - **El ícono va en una ranura**, no suelto y gigante. Un `h-14 w-14 text-faint`
 *   flotando no pertenece a ningún lenguaje de la app; la ranura de 44px con
 *   borde de 1.5px es la misma pieza que el `.slot` de las cards.
 *
 * El ícono llega **ya dimensionado por quien lo usa** (~20px para los de lucide):
 * forzarle un tamaño desde acá deformaría al `<Chancho>`, que no es cuadrado.
 * Va envuelto en un contenedor `aria-hidden`: el título ya dice lo que hay que
 * saber, y "ícono de billetera" no le suma nada a un lector de pantalla.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  /** Ícono de lucide (~20px) o `<Chancho>`. Decorativo: no hace falta pasarle `title`. */
  icon: ReactNode;
  title: string;
  description?: string;
  /** El CTA. En vacío conviene el botón directo y no el «+» del header, que pregunta qué crear. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border-[1.5px] border-dashed border-border bg-surface',
        'py-8 px-5 text-center grid gap-2 justify-items-center',
        className,
      )}
    >
      <span
        className="h-11 w-11 rounded-xl border-[1.5px] border-border bg-surface-2 grid place-items-center text-accent-deep mb-0.5"
        aria-hidden="true"
      >
        {icon}
      </span>

      <h3 className="font-sans font-bold text-text text-base leading-snug text-balance">{title}</h3>

      {description && (
        <p className="font-sans text-[13px] text-muted max-w-[34ch] leading-snug">{description}</p>
      )}

      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
