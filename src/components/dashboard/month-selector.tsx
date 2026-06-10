'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addMonths, subMonths, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { useFinanceStore } from '@/lib/store/financeStore';

interface MonthSelectorProps {
  currentMonth: string;
  baseUrl?: string;
}

const slideVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 56 : -56,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -56 : 56,
    opacity: 0,
  }),
};

export function MonthSelector({ currentMonth, baseUrl = '/' }: MonthSelectorProps) {
  const router = useRouter();
  const [direction, setDirection] = useState(0);
  const getMonthlyComparison = useFinanceStore((s) => s.getMonthlyComparison);
  const comparison = getMonthlyComparison(currentMonth);

  const date = parse(currentMonth, 'yyyy-MM', new Date());
  const prevMonth = format(subMonths(date, 1), 'yyyy-MM');
  const nextMonth = format(addMonths(date, 1), 'yyyy-MM');

  const realPrevLabel = format(subMonths(date, 1), 'MMM', { locale: es });
  const { percentageChange } = comparison;
  const absChange = Math.abs(percentageChange);
  const isHigher = percentageChange > 0;

  const navigate = (dir: number) => {
    setDirection(dir);
    router.push(`${baseUrl}?month=${dir > 0 ? nextMonth : prevMonth}`);
  };

  const handleDragEnd = (_: unknown, info: { offset: { x: number } }) => {
    const THRESHOLD = 50;
    if (info.offset.x < -THRESHOLD) navigate(1);
    else if (info.offset.x > THRESHOLD) navigate(-1);
  };

  return (
    <div data-tour="month-selector" className="flex items-center justify-between gap-3 md:gap-6 py-2 md:py-4 w-full">
      <button
        onClick={() => navigate(-1)}
        className="group flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-border bg-surface text-muted transition-all hover:border-accent/40 hover:bg-accent/10 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        aria-label="Mes anterior"
      >
        <ChevronLeft className="h-4 w-4 md:h-5 md:w-5 transition-transform group-hover:-translate-x-0.5" />
      </button>

      <motion.div
        className="flex min-w-[150px] w-full cursor-grab select-none flex-col items-center active:cursor-grabbing"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        onDragEnd={handleDragEnd}
      >
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentMonth}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="flex flex-col items-center gap-1"
          >
            <span className="font-sans text-[12.5px] font-extrabold capitalize text-text">
              {format(date, 'MMMM yyyy', { locale: es })}
            </span>

            {absChange >= 0.5 && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium leading-none ${
                  isHigher
                    ? 'bg-bad/10 text-bad'
                    : 'bg-good/10 text-good'
                }`}
              >
                {isHigher ? '↑' : '↓'} {absChange.toFixed(0)}% vs {realPrevLabel}
              </span>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      <button
        onClick={() => navigate(1)}
        className="group flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-border bg-surface text-muted transition-all hover:border-accent/40 hover:bg-accent/10 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        aria-label="Mes siguiente"
      >
        <ChevronRight className="h-4 w-4 md:h-5 md:w-5 transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  );
}
