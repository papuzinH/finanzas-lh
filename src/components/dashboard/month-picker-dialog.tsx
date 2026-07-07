'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

interface MonthPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Mes actualmente seleccionado, formato 'yyyy-MM'. */
  currentMonth: string;
  onSelect: (month: string) => void;
}

/**
 * Sheet (mobile) / dialog centrado (desktop) para saltar directo a un mes,
 * sin depender de tocar la flecha anterior/siguiente N veces.
 */
export function MonthPickerDialog({ open, onOpenChange, currentMonth, onSelect }: MonthPickerDialogProps) {
  const selectedYear = parseInt(currentMonth.slice(0, 4), 10);
  const selectedMonthIdx = parseInt(currentMonth.slice(5, 7), 10) - 1;
  const [displayYear, setDisplayYear] = useState(selectedYear);
  const [wasOpen, setWasOpen] = useState(open);

  // Al reabrir, volver a mostrar el año del mes seleccionado (no quedar "perdido" en
  // otro año si el usuario navegó y cerró sin elegir). Ajuste de estado durante el
  // render (patrón sancionado por React para "resetear estado cuando cambia una prop"),
  // en vez de un efecto, para evitar el render en cascada.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDisplayYear(selectedYear);
  }

  const handlePick = (monthIdx: number) => {
    const month = `${displayYear}-${String(monthIdx + 1).padStart(2, '0')}`;
    onSelect(month);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px] bg-surface border-border text-text p-5">
        <DialogHeader className="px-1 pt-1 pb-2">
          <DialogTitle className="text-sm font-bold text-muted">Elegir mes</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between mb-3 px-1">
          <button
            type="button"
            onClick={() => setDisplayYear((y) => y - 1)}
            aria-label="Año anterior"
            className="flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-border text-muted transition-colors hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-poster text-lg text-text tnum">{displayYear}</span>
          <button
            type="button"
            onClick={() => setDisplayYear((y) => y + 1)}
            aria-label="Año siguiente"
            className="flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-border text-muted transition-colors hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div role="radiogroup" aria-label="Mes" className="grid grid-cols-3 gap-2">
          {MONTHS_ES.map((label, idx) => {
            const isSelected = displayYear === selectedYear && idx === selectedMonthIdx;
            return (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => handlePick(idx)}
                className={cn(
                  'min-h-11 rounded-xl px-2 py-2.5 text-sm font-semibold capitalize transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
                  isSelected
                    ? 'bg-accent text-accent-ink'
                    : 'bg-surface-2 text-muted hover:bg-surface hover:text-text'
                )}
              >
                {label.slice(0, 3)}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
