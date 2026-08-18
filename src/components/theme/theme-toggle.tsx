"use client";

import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { aplicarTema, leerTema, type Tema } from "./theme-script";

const OPCIONES: { valor: Tema; label: string; Icon: typeof Sun }[] = [
  { valor: "dia", label: "Día", Icon: Sun },
  { valor: "noche", label: "Noche", Icon: Moon },
];

/**
 * El estado del tema vive en el DOM (`data-theme` en <html>), que el script del
 * <head> ya escribió antes de hidratar. Suscribirse con useSyncExternalStore en
 * vez de copiarlo a un useState evita el setState-dentro-de-effect y hace que
 * el control refleje el tema aunque lo cambie cualquier otro código.
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

export function ThemeToggle() {
  const tema = useSyncExternalStore<Tema>(subscribe, leerTema, () => "dia");

  return (
    <div
      role="radiogroup"
      aria-label="Tema de la app"
      className="flex gap-1 rounded-full border-[1.5px] border-border bg-bg p-[3px]"
    >
      {OPCIONES.map(({ valor, label, Icon }) => {
        const activa = tema === valor;
        return (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={activa}
            onClick={() => aplicarTema(valor)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-[5px] font-sans text-[11.5px] font-extrabold transition-colors duration-[120ms]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              activa ? "bg-text text-bg-2" : "text-muted hover:text-text",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
