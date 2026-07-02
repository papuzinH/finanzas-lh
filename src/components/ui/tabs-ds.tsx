"use client";
import { useId, useRef, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";

type Tab = { id: string; label: string; icon?: string };

export function TabsDS({
  tabs,
  active,
  onChange,
  idBase,
  ariaLabel = "Secciones",
}: {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  /** Si se provee, cada tab expone id + aria-controls para enlazar su panel (`${idBase}-panel-${tab.id}`). */
  idBase?: string;
  ariaLabel?: string;
}) {
  const uid = useId();
  const reduceMotion = useReducedMotion();
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusTab = (i: number) => {
    const next = (i + tabs.length) % tabs.length;
    btnRefs.current[next]?.focus();
    onChange(tabs[next].id);
  };

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        focusTab(i + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        focusTab(i - 1);
        break;
      case "Home":
        e.preventDefault();
        focusTab(0);
        break;
      case "End":
        e.preventDefault();
        focusTab(tabs.length - 1);
        break;
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      className="flex gap-1 p-1 rounded-full bg-surface-2 border-[1.5px] border-border"
    >
      {tabs.map((tab, i) => {
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            role="tab"
            id={idBase ? `${idBase}-tab-${tab.id}` : undefined}
            aria-selected={selected}
            aria-controls={idBase ? `${idBase}-panel-${tab.id}` : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "relative flex-1 flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-full",
              "text-[12.5px] font-bold transition-colors cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2",
              selected ? "text-accent-ink" : "text-muted hover:text-text",
            )}
          >
            {selected && (
              <motion.span
                layoutId={`tabs-ds-indicator-${uid}`}
                aria-hidden
                className="absolute inset-0 rounded-full bg-accent"
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 500, damping: 38 }
                }
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              {tab.icon && <Icon name={tab.icon} size={14} stroke={2.2} />}
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
