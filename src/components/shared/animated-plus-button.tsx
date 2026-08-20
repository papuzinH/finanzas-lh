'use client';

import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface AnimatedPlusButtonProps {
  label: string;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  triggerKey?: string | number; // Para disparar animación cuando cambia
}

export function AnimatedPlusButton({ 
  label, 
  onClick, 
  className,
  disabled = false,
  ariaLabel,
  triggerKey 
}: AnimatedPlusButtonProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showText, setShowText] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    // Con reduced-motion activo, se omite la secuencia de auto-expandir/colapsar.
    if (prefersReducedMotion) return;

    // Secuencia de animación al montar el componente o cambiar triggerKey
    const timer1 = setTimeout(() => {
      setIsExpanded(true);
    }, 100);

    const timer2 = setTimeout(() => {
      setShowText(true);
    }, 200);

    const timer3 = setTimeout(() => {
      setShowText(false);
    }, 3000);

    const timer4 = setTimeout(() => {
      setIsExpanded(false);
    }, 3200);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, [triggerKey, prefersReducedMotion]);

  return (
    // Mobile: contenedor fijo 44px; el botón absoluto se expande sin empujar el layout.
    // Desktop (md+): siempre ampliado → contenedor y botón en flujo normal, ancho al contenido.
    <div className={cn("relative h-11 w-11 shrink-0 md:w-fit", className)}>
      <button
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "absolute right-0 top-0 flex items-center justify-center rounded-full bg-accent text-accent-ink border-[1.5px] border-accent-deep disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 active:translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 z-10",
          // En desktop la pill queda fija y expandida, sin depender del estado de animación.
          "md:static md:h-11 md:w-fit md:px-3.5 md:min-w-11",
          isExpanded
            ? "h-11 px-3.5 min-w-11"
            : "h-11 w-11",
        )}
        aria-label={ariaLabel || label}
      >
        <Plus
          className={cn(
            "transition-all duration-200 shrink-0 md:h-3.5 md:w-3.5 md:mr-1.5",
            showText ? "h-3.5 w-3.5 mr-1.5" : "h-4 w-4"
          )}
        />
        <span
          className={cn(
            "text-xs font-medium whitespace-nowrap transition-all duration-200 overflow-hidden md:opacity-100 md:max-w-[200px]",
            showText
              ? "opacity-100 max-w-[200px]"
              : "opacity-0 max-w-0"
          )}
        >
          {label}
        </span>
      </button>
    </div>
  );
}