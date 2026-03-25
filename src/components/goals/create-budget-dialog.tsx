'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { cn } from '@/lib/utils';
import { categoryBudgetSchema, type CategoryBudgetSchema } from '@/lib/schemas/category-budget';
import { createCategoryBudget } from '@/app/dashboard/goals/actions';
import { useFinanceStore } from '@/lib/store/financeStore';
import { AmountField } from '@/components/transactions/transaction-form-fields';
import type { Category } from '@/types/database';

interface Props {
  categories: Category[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CreateBudgetDialog({ 
  categories, 
  open: controlledOpen, 
  onOpenChange: controlledOnOpenChange 
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const fetchGoalsData = useFinanceStore((s) => s.fetchGoalsData);
  const { categoryBudgets } = useFinanceStore();

  // Use controlled props if provided, otherwise use internal state
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange || setInternalOpen;

  const availableCategories = useMemo(() => {
    const existingIds = new Set(
      categoryBudgets.filter((b) => b.is_active).map((b) => b.category_id)
    );
    return categories.filter((c) => !existingIds.has(c.id));
  }, [categories, categoryBudgets]);

  const form = useForm<CategoryBudgetSchema>({
    resolver: zodResolver(categoryBudgetSchema),
    defaultValues: {
      category_id: '',
      amount: 0,
      currency: 'ARS',
    },
  });

  const watchedAmount = form.watch('amount');
  const watchedCategoryId = form.watch('category_id');

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (v) {
      form.reset({ category_id: '', amount: 0, currency: 'ARS' });
    }
  };

  async function onSubmit(data: CategoryBudgetSchema) {
    setIsPending(true);
    try {
      const result = await createCategoryBudget(data);

      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success('¡Presupuesto creado!');
        setOpen(false);
        await fetchGoalsData();
      }
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="icon" className="h-9 w-9 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton
        className="max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0 sm:max-w-[500px] bg-surface border-slate-800/50 text-slate-50"
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="text-xl font-bold text-indigo-300">
            Nuevo Presupuesto
          </DialogTitle>
          <p className="text-sm text-slate-400 mt-1">
            Establecé un límite mensual de gasto por categoría.
          </p>
        </DialogHeader>

        <Form {...form}>
          <form id="budget-form" onSubmit={form.handleSubmit(onSubmit)} className="contents">
            <div className="overflow-y-auto flex-1 px-6 pb-4 space-y-5">

              {/* ── Amount ── */}
              <AmountField<CategoryBudgetSchema>
                control={form.control}
                setValue={form.setValue}
                watchedAmount={watchedAmount}
                fieldName="amount"
              />

              {/* ── Category Picker ── */}
              <FormField
                control={form.control}
                name="category_id"
                render={({ field }) => (
                  <FormItem>
                    <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
                      Categoría
                    </span>

                    {availableCategories.length === 0 ? (
                      <p className="text-sm text-slate-500 italic py-2">
                        Todas las categorías ya tienen presupuesto asignado.
                      </p>
                    ) : (
                      <div className="grid grid-cols-4 gap-2 pt-1">
                        {availableCategories.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => field.onChange(cat.id)}
                            className={cn(
                              'flex flex-col items-center gap-1 p-2 rounded-xl transition-all min-h-11',
                              'focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none',
                              field.value === cat.id
                                ? 'bg-indigo-500/20 ring-1 ring-indigo-400'
                                : 'bg-slate-800/40 hover:bg-slate-700/40'
                            )}
                          >
                            <span className="text-lg">{cat.emoji ?? '📦'}</span>
                            <span className="text-[9px] text-slate-400 truncate w-full text-center">
                              {cat.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Currency Toggle ── */}
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
                      Moneda
                    </span>
                    <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-900/80 p-1">
                      {([
                        { value: 'ARS' as const, label: '🇦🇷 ARS' },
                        { value: 'USD' as const, label: '🇺🇸 USD' },
                      ]).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => field.onChange(opt.value)}
                          className={cn(
                            'min-h-11 rounded-lg py-3 text-sm font-semibold transition-all',
                            'focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none',
                            field.value === opt.value
                              ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/50'
                              : 'text-slate-500 hover:text-slate-300'
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* ── Submit Button ── */}
            <div className="px-6 pb-6 pt-3 shrink-0">
              <Button
                type="submit"
                form="budget-form"
                disabled={isPending || availableCategories.length === 0}
                className="w-full min-h-[52px] rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-base font-semibold shadow-[0_0_24px_rgba(129,140,248,0.25)] transition-all active:scale-[0.98]"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Creando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-5 w-5" />
                    Crear Presupuesto
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
