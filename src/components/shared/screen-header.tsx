import { cn } from "@/lib/utils";
import type React from "react";

export function ScreenHeader({
  kicker,
  title,
  sub,
  icon,
  right,
  compact,
  className,
}: {
  kicker?: string;
  title: string;
  sub?: string;
  /** Marca a la izquierda del título. Se usa en Inicio, con el chancho. */
  icon?: React.ReactNode;
  right?: React.ReactNode;
  /** Header del sistema de layouts (mocks 2026-08-14): título 22px, sin kicker ni sub. */
  compact?: boolean;
  className?: string;
}) {
  // Sin kicker ni sub el título es una sola línea: ahí la marca y el botón se
  // alinean al centro, como en la variante compact (si no, el chancho flota arriba).
  const tight = compact || (!kicker && !sub);

  return (
    <div className={cn(compact ? "px-5 pt-[18px] pb-3" : "px-5 pt-3 pb-4", className)}>
      <div className={cn("flex justify-between gap-3", tight ? "items-center" : "items-start")}>
        {icon && <div className={cn("shrink-0", !tight && "pt-0.5")}>{icon}</div>}
        <div className="min-w-0 flex-1">
          {!compact && kicker && (
            <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.22em] text-accent-deep mb-1">
              {kicker}
            </p>
          )}
          <h1 className={cn("font-display text-text leading-none", compact ? "text-[22px]" : "text-[28px]")}>
            {title}
          </h1>
          {!compact && sub && (
            <p className="font-sans text-[12.5px] text-muted mt-1.5">{sub}</p>
          )}
        </div>
        {right && (
          <div className={cn("shrink-0 flex items-center gap-2", !tight && "mt-1")}>{right}</div>
        )}
      </div>
    </div>
  );
}
