'use client';

import { useId } from "react";
import { cn } from "@/lib/utils";
import { ChanchoShape } from "./chancho";

/**
 * El chancho de la marca usado como **medidor**: se llena de abajo hacia arriba
 * con lo que la persona lleva ahorrado.
 *
 * Nació para /objetivos (2026-08-22). Las metas no tienen emoji propio en la base,
 * así que antes todas las cards mostraban el mismo chancho quieto: decoraba sin
 * informar. Llenándose, el mismo dibujo pasa a ser el dato — y de paso la marca
 * hace el trabajo que haría un gráfico genérico.
 *
 * La silueta vacía queda siempre visible en tenue, para que el recorte se lea
 * como "nivel" y no como un chancho a medio dibujar.
 */
export function ChanchoGauge({
  percent,
  className,
  slot = "var(--logo-slot)",
  title,
}: {
  /** 0–100. Se recorta al rango: un aporte de más no desborda el dibujo. */
  percent: number;
  className?: string;
  /** Color de ranura, ojo y fosa: el del fondo sobre el que se apoya. */
  slot?: string;
  /** Nombre accesible. Sin esto el medidor es decorativo y se oculta a lectores. */
  title?: string;
}) {
  // Un id por instancia: dos medidores en la misma pantalla no pueden compartir clip.
  const clipId = useId();
  const safe = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));

  // El viewBox mide 146 de alto; el relleno sube desde abajo.
  const VIEW_H = 146;
  const y = VIEW_H * (1 - safe / 100);

  return (
    <svg
      viewBox="0 0 194 146"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("block", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y={y} width="194" height={VIEW_H - y} />
        </clipPath>
      </defs>

      {/* Silueta: el chancho vacío, siempre presente */}
      <g className="opacity-25">
        <ChanchoShape slot={slot} />
      </g>

      {/* Lo ahorrado */}
      <g clipPath={`url(#${clipId})`}>
        <ChanchoShape slot={slot} />
      </g>
    </svg>
  );
}
