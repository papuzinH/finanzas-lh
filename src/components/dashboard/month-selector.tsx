'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addMonths, subMonths, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';

interface MonthSelectorProps {
  currentMonth: string;
  baseUrl?: string;
}

export function MonthSelector({ currentMonth, baseUrl = '/' }: MonthSelectorProps) {
  // Parse the current month string (yyyy-MM) to a Date object
  // Fallback to current date if parsing fails (though it shouldn't with correct usage)
  const date = parse(currentMonth, 'yyyy-MM', new Date());
  
  const prevMonth = format(subMonths(date, 1), 'yyyy-MM');
  const nextMonth = format(addMonths(date, 1), 'yyyy-MM');

  return (
    <div className="flex items-center justify-center gap-3 md:gap-6 py-2 md:py-4">
      <Link 
        href={`${baseUrl}?month=${prevMonth}`} 
        className="group flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-full border border-slate-800 bg-slate-900/50 text-slate-400 transition-all hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-500"
        aria-label="Mes anterior"
      >
        <ChevronLeft className="h-4 w-4 md:h-5 md:w-5 transition-transform group-hover:-translate-x-0.5" />
      </Link>
      
      <div className="flex flex-col items-center min-w-[140px]">
        <h2 className="text-lg md:text-xl font-bold capitalize tracking-tight text-slate-100">
          {format(date, 'MMMM yyyy', { locale: es })}
        </h2>
        <span className="text-[8px] md:text-[10px] font-medium uppercase tracking-widest text-slate-500">
          Período Seleccionado
        </span>
      </div>

      <Link 
        href={`${baseUrl}?month=${nextMonth}`} 
        className="group flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-full border border-slate-800 bg-slate-900/50 text-slate-400 transition-all hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-500"
        aria-label="Mes siguiente"
      >
        <ChevronRight className="h-4 w-4 md:h-5 md:w-5 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
