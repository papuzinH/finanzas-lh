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
            type="button"
            key={item.description}
            onClick={() => handleChipTap(item)}
            className="flex-shrink-0 flex items-center gap-1.5 min-h-11 bg-surface-2 border border-border rounded-full px-3 py-2 text-xs text-text hover:border-accent/50 hover:text-text transition-colors active:scale-95"
          >
            <span>{item.lastCategoryEmoji ?? '💸'}</span>
            <span className="max-w-[80px] truncate capitalize">{item.description}</span>
            <span className="text-muted font-mono">{formatCurrency(Math.round(item.avgAmount))}</span>
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
