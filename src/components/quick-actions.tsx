'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { History, CreditCard } from 'lucide-react';

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-4 w-full">
      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
        <Link 
          href="/movimientos"
          className="flex items-center justify-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-3 text-sm font-medium transition-all border border-slate-700 hover:border-slate-600"
        >
          <History className="h-4 w-4" />
          Ver Historial
        </Link>
      </motion.div>
      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
        <Link 
          href="/cuotas"
          className="flex items-center justify-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-3 text-sm font-medium transition-all border border-slate-700 hover:border-slate-600"
        >
          <CreditCard className="h-4 w-4" />
          Ver Deudas
        </Link>
      </motion.div>
    </div>
  );
}
