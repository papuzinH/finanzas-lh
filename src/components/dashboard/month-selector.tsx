'use client';

import { ChevronDown } from 'lucide-react';
import { format, addMonths, subMonths, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useFinanceStore } from '@/lib/store/financeStore';
import { MonthPickerDialog } from '@/components/dashboard/month-picker-dialog';

interface MonthSelectorProps {
  currentMonth: string;
  baseUrl?: string;
  variant?: 'default' | 'pill';
}

/**
 * Selector de mes que actúa como título de la pantalla (reemplaza el <h1> visual):
 * tap abre el picker de mes/año, swipe va al mes anterior/siguiente. El chevron
 * junto al mes es la pista visual de que es tappable (no un simple texto).
 */
export function MonthSelector({ currentMonth, baseUrl = '/', variant = 'default' }: MonthSelectorProps) {
  const router = useRouter();
  const [direction, setDirection] = useState(0);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const hasDraggedRef = useRef(false);
  const getMonthlyComparison = useFinanceStore((s) => s.getMonthlyComparison);
  const comparison = getMonthlyComparison(currentMonth);

  const slideVariants = {
    enter: (dir: number) => ({
      x: prefersReducedMotion ? 0 : dir > 0 ? 56 : -56,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: prefersReducedMotion ? 0 : dir > 0 ? -56 : 56,
      opacity: 0,
    }),
  };

  const date = parse(currentMonth, 'yyyy-MM', new Date());
  const prevMonth = format(subMonths(date, 1), 'yyyy-MM');
  const nextMonth = format(addMonths(date, 1), 'yyyy-MM');

  const realPrevLabel = format(subMonths(date, 1), 'MMM', { locale: es });
  const { percentageChange } = comparison;
  const absChange = Math.abs(percentageChange);
  const isHigher = percentageChange > 0;
  const comparisonText = absChange >= 0.5
    ? `${isHigher ? 'subió' : 'bajó'} ${absChange.toFixed(0)}% vs ${realPrevLabel}`
    : null;

  const goToMonth = (targetMonth: string) => {
    setDirection(targetMonth > currentMonth ? 1 : -1);
    router.push(`${baseUrl}?month=${targetMonth}`);
  };

  const navigate = (dir: number) => goToMonth(dir > 0 ? nextMonth : prevMonth);

  const handleDragStart = () => {
    hasDraggedRef.current = false;
  };

  const handleDrag = (_: unknown, info: { offset: { x: number } }) => {
    if (Math.abs(info.offset.x) > 5) hasDraggedRef.current = true;
  };

  const handleDragEnd = (_: unknown, info: { offset: { x: number } }) => {
    const THRESHOLD = 50;
    if (info.offset.x < -THRESHOLD) navigate(1);
    else if (info.offset.x > THRESHOLD) navigate(-1);
  };

  const handleTap = () => {
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      return;
    }
    setIsPickerOpen(true);
  };

  return (
    <div data-tour="month-selector">
      {/* Encabezado real para lectores de pantalla/SEO: el mes reemplaza visualmente
          al título, pero la jerarquía de headings de la página se mantiene.
          En variante pill la pantalla ya tiene su propio h1, así que se omite. */}
      {variant === 'default' && <h1 className="sr-only">Movimientos</h1>}

      <motion.div
        role="button"
        tabIndex={0}
        aria-label={`Mes actual: ${format(date, 'MMMM yyyy', { locale: es })}${
          comparisonText ? `, ${comparisonText}` : ''
        }. Tocar para elegir otro mes, deslizar para ir al anterior o siguiente.`}
        onClick={handleTap}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsPickerOpen(true);
          }
        }}
        className="inline-flex cursor-grab select-none flex-col items-start gap-0.5 rounded-lg -m-1 p-1 transition-opacity active:cursor-grabbing active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
      >
        {variant === 'pill' ? (
          <span className="flex items-center gap-1.5 bg-surface border-[1.5px] border-border rounded-full px-3 py-[7px] font-sans font-bold text-[12.5px] text-text">
            {format(date, 'MMMM yyyy', { locale: es })}
            <ChevronDown className="h-[13px] w-[13px]" strokeWidth={2.4} aria-hidden="true" />
          </span>
        ) : (
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentMonth}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeInOut' }}
              className="flex flex-col gap-0.5"
            >
              <span className="flex items-center gap-1 font-display text-text text-[24px] md:text-[26px] leading-none capitalize">
                {format(date, 'MMMM yyyy', { locale: es })}
                <ChevronDown className="h-5 w-5 text-muted shrink-0" aria-hidden="true" />
              </span>

              {comparisonText && (
                <span className={cn('text-[11px] font-semibold', isHigher ? 'text-bad' : 'text-good')}>
                  {isHigher ? '↑' : '↓'} {absChange.toFixed(0)}% vs {realPrevLabel}
                </span>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </motion.div>

      <MonthPickerDialog
        open={isPickerOpen}
        onOpenChange={setIsPickerOpen}
        currentMonth={currentMonth}
        onSelect={goToMonth}
      />
    </div>
  );
}
