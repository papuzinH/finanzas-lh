'use client';

import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
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

  useEffect(() => {
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
  }, [triggerKey]); // Dependencia en triggerKey

  return (
    <div className={cn("relative h-9 w-9 shrink-0", className)}>
      <button
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "absolute right-0 top-0 flex items-center justify-center rounded-full bg-accent text-accent-ink border-[1.5px] border-accent-deep shadow-offset disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 active:translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 z-10",
          isExpanded
            ? "h-9 px-3 min-w-9"
            : "h-9 w-9",
        )}
        aria-label={ariaLabel || label}
      >
        <Plus
          className={cn(
            "transition-all duration-200 shrink-0",
            showText ? "h-3.5 w-3.5 mr-1.5" : "h-4 w-4"
          )}
        />
        <span
          className={cn(
            "text-xs font-medium whitespace-nowrap transition-all duration-200 overflow-hidden",
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