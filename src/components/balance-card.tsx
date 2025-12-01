'use client';

import { motion } from 'framer-motion';
import { Wallet, TrendingUp, TrendingDown } from 'lucide-react';

interface BalanceCardProps {
  balance: number;
  income: number;
  expense: number;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export function BalanceCard({ balance, income, expense }: BalanceCardProps) {
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, type: "spring" }}
      className="relative w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-8 shadow-2xl backdrop-blur-sm"
    >
      <div className="absolute top-0 right-0 -mt-4 -mr-4 h-32 w-32 rounded-full bg-indigo-500/5 blur-3xl"></div>
      <div className="absolute bottom-0 left-0 -mb-4 -ml-4 h-32 w-32 rounded-full bg-emerald-500/5 blur-3xl"></div>
      
      <div className="relative z-10">
        <div className="flex items-center justify-center gap-2 text-slate-400 mb-3">
          <Wallet className="h-5 w-5" />
          <span className="text-sm font-medium uppercase tracking-wider">Balance Global</span>
        </div>
        
        <motion.h1 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className={`text-5xl sm:text-6xl font-bold tracking-tight font-mono mb-2 ${
            balance >= 0 ? 'text-white' : 'text-red-400'
          }`}
        >
          {formatCurrency(balance)}
        </motion.h1>
        
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex items-center justify-center gap-6 mt-4 text-sm"
        >
          <div className="flex items-center gap-1.5 text-emerald-400/80">
            <TrendingUp className="h-4 w-4" />
            <span>{formatCurrency(income)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-red-400/80">
            <TrendingDown className="h-4 w-4" />
            <span>{formatCurrency(Math.abs(expense))}</span>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
