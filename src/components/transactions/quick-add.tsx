'use client';

import { useState } from 'react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { CreateTransactionDialog } from '@/components/transactions/create-transaction-dialog';
import { formatCurrency } from '@/lib/utils';

export function QuickAdd() {
  const { getFrequentTransactions } = useFinanceStore();
  const frequent = getFrequentTransactions(5);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDefaults, setSelectedDefaults] = useState<{
    description: string;
    category_id?: string;
    amount: number;
    type: 'expense' | 'income';
  } | undefined>(undefined);

  if (frequent.length === 0) return null;

  const handleChipTap = (item: (typeof frequent)[number]) => {
    setSelectedDefaults({
      description: item.description,
      category_id: item.lastCategoryId ?? undefined,
      amount: Math.round(item.avgAmount),
      type: item.type,
    });
    setDialogOpen(true);
  };

  return (
    <>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide px-4 -mx-4">
        {frequent.map((item) => (
          <button
            key={item.description}
            onClick={() => handleChipTap(item)}
            className="flex-shrink-0 flex items-center gap-1.5 bg-surface-raised/50 border border-slate-800 rounded-full px-3 py-2 text-xs text-slate-300 hover:border-indigo-500/50 hover:text-slate-100 transition-colors active:scale-95"
          >
            <span>{item.lastCategoryEmoji ?? '💸'}</span>
            <span className="max-w-[80px] truncate capitalize">{item.description}</span>
            <span className="text-slate-500 font-mono">{formatCurrency(Math.round(item.avgAmount))}</span>
          </button>
        ))}
      </div>

      <CreateTransactionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultValues={selectedDefaults}
      />
    </>
  );
}
