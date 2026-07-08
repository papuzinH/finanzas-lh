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
import { Form, FormField, FormItem, FormMessage } from '@/components/ui/form';
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
      {controlledOpen === undefined && (
        <DialogTrigger asChild>
          <Button size="icon-sm" variant="accent">
            <Plus className="h-4 w-4" />
          </Button>
        </DialogTrigger>
      )}
      <DialogContent
        showCloseButton
        className="max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0 sm:max-w-[500px] bg-surface border-border text-text"
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="font-poster text-text text-[18px]">
            Nuevo Presupuesto
          </DialogTitle>
          <p className="text-sm text-muted mt-1">
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
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
                      Categoría
                    </span>

                    {availableCategories.length === 0 ? (
                      <p className="text-sm text-muted italic py-2">
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
                              'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none',
                              field.value === cat.id
                                ? 'bg-accent/10 ring-1 ring-accent'
                                : 'bg-surface-2 hover:bg-surface'
                            )}
                          >
                            <span className="text-lg">{cat.emoji ?? '📦'}</span>
                            <span className="text-[9px] text-muted truncate w-full text-center">
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
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
                      Moneda
                    </span>
                    <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
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
                            'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none',
                            field.value === opt.value
                              ? 'bg-accent/10 text-accent ring-1 ring-accent/50'
                              : 'text-muted hover:text-text'
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
                variant="accent" size="lg" className="w-full"
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
