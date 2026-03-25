'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { Loader2, Pencil, Target } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { createSavingsGoalFormSchema, type CreateSavingsGoalFormSchema } from '@/lib/schemas/savings-goal';
import { updateSavingsGoal } from '@/app/dashboard/goals/actions';
import { useFinanceStore } from '@/lib/store/financeStore';
import { AmountField } from '@/components/transactions/transaction-form-fields';
import type { SavingsGoal } from '@/types/database';

interface Props {
  goal: SavingsGoal;
}

export function EditSavingsGoalDialog({ goal }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const fetchGoalsData = useFinanceStore((s) => s.fetchGoalsData);

  const form = useForm<CreateSavingsGoalFormSchema>({
    resolver: zodResolver(createSavingsGoalFormSchema),
    defaultValues: {
      name: goal.name,
      type: goal.type,
      target_amount: goal.target_amount,
      currency: goal.currency,
      target_date: goal.target_date ? new Date(goal.target_date + 'T00:00:00') : null,
    },
  });

  const watchedAmount = form.watch('target_amount');
  const watchedType = form.watch('type');

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (v) {
      form.reset({
        name: goal.name,
        type: goal.type,
        target_amount: goal.target_amount,
        currency: goal.currency,
        target_date: goal.target_date ? new Date(goal.target_date + 'T00:00:00') : null,
      });
    }
  };

  async function onSubmit(data: CreateSavingsGoalFormSchema) {
    setIsPending(true);
    try {
      const result = await updateSavingsGoal(goal.id, {
        name: data.name,
        type: data.type,
        target_amount: data.target_amount,
        currency: data.currency,
        target_date: data.target_date ? format(data.target_date, 'yyyy-MM-dd') : null,
      });

      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success('¡Meta actualizada!');
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
        <Button variant="ghost" size="icon" aria-label="Editar meta" className="h-11 w-11 text-slate-400 hover:text-slate-100 hover:bg-slate-800">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton
        className="max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0 sm:max-w-[500px] bg-surface border-slate-800/50 text-slate-50"
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="text-xl font-bold text-emerald-300">
            Editar Meta
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form id="edit-savings-goal-form" onSubmit={form.handleSubmit(onSubmit)} className="contents">
            <div className="overflow-y-auto flex-1 px-6 pb-4 space-y-5">

              {/* ── Amount ── */}
              <AmountField<CreateSavingsGoalFormSchema>
                control={form.control}
                setValue={form.setValue}
                watchedAmount={watchedAmount}
                fieldName="target_amount"
              />

              {/* ── Name ── */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
                      Nombre de la meta
                    </span>
                    <FormControl>
                      <div className="relative">
                        <Target className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                        <Input
                          placeholder="Ej: Vacaciones en Brasil..."
                          {...field}
                          className="pl-10 bg-surface-raised border-0 rounded-xl min-h-11 text-slate-50 placeholder:text-slate-600 focus-visible:ring-2 focus-visible:ring-emerald-500"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Type Toggle ── */}
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
                      Tipo de meta
                    </span>
                    <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-900/80 p-1">
                      {([
                        { value: 'one_time' as const, label: 'Con fecha' },
                        { value: 'monthly' as const, label: 'Mensual' },
                      ]).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => field.onChange(opt.value)}
                          className={cn(
                            'min-h-11 rounded-lg py-3 text-sm font-semibold transition-all',
                            'focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none',
                            field.value === opt.value
                              ? 'bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)]'
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
                            'focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none',
                            field.value === opt.value
                              ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/50'
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

              {/* ── Target Date (only for one_time) ── */}
              {watchedType === 'one_time' && (
                <FormField
                  control={form.control}
                  name="target_date"
                  render={({ field }) => (
                    <FormItem>
                      <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
                        Fecha objetivo
                      </span>
                      <FormControl>
                        <Input
                          type="date"
                          value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                          onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : null)}
                          className="bg-surface-raised border-0 rounded-xl min-h-11 text-slate-50 focus-visible:ring-2 focus-visible:ring-emerald-500 block w-full"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* ── Submit Button ── */}
            <div className="px-6 pb-6 pt-3 shrink-0">
              <Button
                type="submit"
                form="edit-savings-goal-form"
                disabled={isPending}
                className="w-full min-h-[52px] rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-base font-semibold shadow-[0_0_24px_rgba(16,185,129,0.25)] transition-all active:scale-[0.98]"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Guardar cambios'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
