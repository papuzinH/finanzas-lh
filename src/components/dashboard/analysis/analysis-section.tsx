'use client';

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { TabsDS } from '@/components/ui/tabs-ds';
import { cn } from '@/lib/utils';
import { useFinanceStore } from '@/lib/store/financeStore';
import { TabEsteMes } from './tab-este-mes';
import { TabTendencia } from './tab-tendencia';
import { TabCategorias } from './tab-categorias';

const TABS = [
  { id: 'mes', label: 'Este mes' },
  { id: 'tendencia', label: 'Tendencia' },
  { id: 'categorias', label: 'Categorías' },
];

const CURRENCIES = ['ARS', 'USD'] as const;

export function AnalysisSection() {
  const [active, setActive] = useState('mes');
  const { displayCurrency, setDisplayCurrency } = useFinanceStore();
  const reduceMotion = useReducedMotion();

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <TabsDS
            tabs={TABS}
            active={active}
            onChange={setActive}
            idBase="analysis"
            ariaLabel="Vista del análisis"
          />
        </div>

        <div
          role="group"
          aria-label="Moneda de visualización"
          className="shrink-0 flex gap-1 p-1 rounded-full bg-surface-2 border-[1.5px] border-border"
        >
          {CURRENCIES.map((cur) => {
            const selected = displayCurrency === cur;
            return (
              <button
                key={cur}
                type="button"
                onClick={() => setDisplayCurrency(cur)}
                aria-pressed={selected}
                className={cn(
                  'min-h-9 px-3 rounded-full text-[11px] font-bold tnum transition-colors cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2',
                  selected ? 'bg-accent text-accent-ink' : 'text-muted hover:text-text',
                )}
              >
                {cur}
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          role="tabpanel"
          id={`analysis-panel-${active}`}
          aria-labelledby={`analysis-tab-${active}`}
          tabIndex={0}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg rounded-2xl"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: reduceMotion ? 0 : 0.22, ease: 'easeInOut' }}
        >
          {active === 'mes' && <TabEsteMes />}
          {active === 'tendencia' && <TabTendencia />}
          {active === 'categorias' && <TabCategorias />}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
