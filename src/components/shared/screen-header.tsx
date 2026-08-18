import { cn } from "@/lib/utils";
import type React from "react";

export function ScreenHeader({
  kicker,
  title,
  sub,
  icon,
  right,
  className,
}: {
  kicker?: string;
  title: string;
  sub?: string;
  /** Marca a la izquierda del título. Se usa en Inicio, con el chancho. */
  icon?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-5 pt-3 pb-4", className)}>
      <div className="flex items-start justify-between gap-3">
        {icon && <div className="shrink-0 pt-0.5">{icon}</div>}
        <div className="min-w-0 flex-1">
          {kicker && (
            <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.22em] text-accent-deep mb-1">
              {kicker}
            </p>
          )}
          <h1 className="font-display text-text text-[28px] leading-none">{title}</h1>
          {sub && (
            <p className="font-sans text-[12.5px] text-muted mt-1.5">{sub}</p>
          )}
        </div>
        {right && (
          <div className="shrink-0 flex items-center gap-2 mt-1">{right}</div>
        )}
      </div>
    </div>
  );
}
