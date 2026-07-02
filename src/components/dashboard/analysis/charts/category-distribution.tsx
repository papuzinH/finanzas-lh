'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency } from '@/lib/utils';

// Escala categórica de la marca (globals.css). Nunca hex hardcodeado.
const CHART_VARS = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)',
  'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)', 'var(--chart-8)',
];

const rowVariants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, damping: 22, stiffness: 220 },
  },
};

export function CategoryDistribution({
  scope = 'current_month',
  onSelect,
}: {
  scope?: 'global' | 'current_month';
  onSelect?: (name: string) => void;
}) {
  const { getCategoryBreakdown, toDisplay } = useFinanceStore();
  const reduceMotion = useReducedMotion();
  const breakdown = getCategoryBreakdown(scope);
  const items = breakdown.items; // ya viene ordenado de mayor a menor

  if (items.length === 0) {
    const emptyCopy = scope === 'global' ? 'Sin gastos registrados' : 'Sin gastos este mes';
    return <div className="h-[120px] flex items-center justify-center text-xs text-muted italic">{emptyCopy}</div>;
  }

  return (
    <motion.ul
      role="list"
      aria-label={`Distribución del gasto por categoría: ${items.length} ${items.length === 1 ? 'categoría' : 'categorías'}.`}
      className="flex flex-col gap-1"
      variants={reduceMotion ? undefined : { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      initial={reduceMotion ? false : 'hidden'}
      animate={reduceMotion ? false : 'show'}
    >
      {items.map((item, i) => {
        const color = CHART_VARS[i % CHART_VARS.length];
        const display = formatCurrency(toDisplay(item.value));
        const pct = item.percentage;
        const pctLabel = `${pct.toFixed(1)}%`;

        return (
          <motion.li key={item.name} variants={reduceMotion ? undefined : rowVariants}>
            <button
              type="button"
              onClick={() => onSelect?.(item.name)}
              aria-label={`${item.name}: ${pctLabel} del gasto, ${display}. Ver detalle.`}
              className="group w-full text-left rounded-xl px-2 py-2 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface cursor-pointer"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-text">{item.name}</span>
                <span className="shrink-0 text-sm font-bold tnum text-text">{pctLabel}</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-2"
                  aria-hidden="true"
                >
                  <motion.span
                    className="absolute inset-y-0 left-0 rounded-full origin-left"
                    style={{ width: `${Math.max(pct, 1.5)}%`, backgroundColor: color }}
                    initial={reduceMotion ? false : { scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ type: 'spring', damping: 24, stiffness: 180, delay: reduceMotion ? 0 : 0.15 + i * 0.05 }}
                  />
                </span>
                <span className="shrink-0 text-xs tnum text-muted">{display}</span>
              </div>
            </button>
          </motion.li>
        );
      })}
    </motion.ul>
  );
}
