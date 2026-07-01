'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TabsDS } from '@/components/ui/tabs-ds';
import { useFinanceStore } from '@/lib/store/financeStore';
import { TabEsteMes } from './tab-este-mes';
import { TabTendencia } from './tab-tendencia';
import { TabCategorias } from './tab-categorias';

const TABS = [
  { id: 'mes', label: 'Este mes' },
  { id: 'tendencia', label: 'Tendencia' },
  { id: 'categorias', label: 'Categorías' },
];

export function AnalysisSection() {
  const [active, setActive] = useState('mes');
  const { displayCurrency, setDisplayCurrency } = useFinanceStore();

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <TabsDS tabs={TABS} active={active} onChange={setActive} />
        <button
          onClick={() => setDisplayCurrency(displayCurrency === 'ARS' ? 'USD' : 'ARS')}
          aria-label="Cambiar moneda de visualización"
          className="shrink-0 rounded-full border-[1.5px] border-border bg-surface-2 px-3 py-2 text-[11px] font-bold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <span className={displayCurrency === 'ARS' ? 'text-accent' : 'text-muted'}>ARS</span>
          <span className="text-faint mx-1">·</span>
          <span className={displayCurrency === 'USD' ? 'text-accent' : 'text-muted'}>USD</span>
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: 'easeInOut' }}
        >
          {active === 'mes' && <TabEsteMes />}
          {active === 'tendencia' && <TabTendencia />}
          {active === 'categorias' && <TabCategorias />}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
