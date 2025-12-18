'use client';

import { motion } from 'framer-motion';
import { Transaction } from '@/types/database';
import { useFinanceStore } from '@/lib/store/financeStore';
import { 
  Coffee, 
  ShoppingBag, 
  Home as HomeIcon, 
  Car, 
  Smartphone,
  DollarSign
} from 'lucide-react';
import { format, parse } from 'date-fns';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (dateString: string) => {
  const date = parse(dateString, 'yyyy-MM-dd', new Date());
  return format(date, 'dd/MM');
};

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

export function TransactionList({ transactions }: { transactions: Transaction[] }) {
  const { categories } = useFinanceStore();

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 text-slate-500">
        <p className="text-sm">No hay movimientos registrados.</p>
      </div>
    );
  }

  return (
    <motion.div 
      className="space-y-2"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {transactions.map((t) => {
        const category = categories.find(c => c.id === t.category_id);
        return (
        <motion.div 
          key={t.id} 
          variants={item}
          className="group flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 transition-all hover:bg-slate-900 hover:border-slate-700"
        >
          <div className="flex items-center gap-4">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full border border-slate-800 ${
              t.type === 'income' 
                ? 'bg-emerald-500/5 text-emerald-500' 
                : 'bg-slate-800/50 text-slate-400'
            }`}>
              {category?.emoji ? <span className="text-lg">{category.emoji}</span> : <DollarSign className="h-4 w-4" />}
            </div>
            <div>
              <p className="font-medium text-sm text-slate-200 truncate max-w-[180px] sm:max-w-[300px]">{t.description}</p>
              <p className="text-xs text-slate-500 capitalize">{category?.name || 'General'}</p>
            </div>
          </div>
          <div className="text-right">
            <p className={`font-bold text-sm font-mono tracking-tight ${
              t.type === 'income' ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {t.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(t.amount))}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{formatDate(t.date)}</p>
          </div>
        </motion.div>
        );
      })}
    </motion.div>
  );
}
