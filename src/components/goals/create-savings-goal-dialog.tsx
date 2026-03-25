'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { Loader2, Plus, CheckCircle2, Target } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { createSavingsGoalFormSchema, type CreateSavingsGoalFormSchema } from '@/lib/schemas/savings-goal';
import { createSavingsGoal } from '@/app/dashboard/goals/actions';
import { useFinanceStore } from '@/lib/store/financeStore';
import { AmountField } from '@/components/transactions/transaction-form-fields';

interface CreateSavingsGoalDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CreateSavingsGoalDialog({ 
  open: controlledOpen, 
  onOpenChange: controlledOnOpenChange 
}: CreateSavingsGoalDialogProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const fetchGoalsData = useFinanceStore((s) => s.fetchGoalsData);

  // Use controlled props if provided, otherwise use internal state
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange || setInternalOpen;

  const form = useForm<CreateSavingsGoalFormSchema>({
    resolver: zodResolver(createSavingsGoalFormSchema),
    defaultValues: {
      name: '',
      type: 'one_time',
      target_amount: 0,
      currency: 'ARS',
      target_date: null,
    },
  });

  const watchedAmount = form.watch('target_amount');
  const watchedType = form.watch('type');
  const watchedCurrency = form.watch('currency');

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (v) {
      form.reset({
        name: '',
        type: 'one_time',
        target_amount: 0,
        currency: 'ARS',
        target_date: null,
      });
    }
  };

  async function onSubmit(data: CreateSavingsGoalFormSchema) {
    setIsPending(true);
    try {
      const result = await createSavingsGoal({
        name: data.name,
        type: data.type,
        target_amount: data.target_amount,
        currency: data.currency,
        target_date: data.target_date ? format(data.target_date, 'yyyy-MM-dd') : null,
      });

      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success('¡Meta de ahorro creada!');
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
        <Button size="icon" className="h-9 w-9 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton
        className="max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0 sm:max-w-[500px] bg-surface border-slate-800/50 text-slate-50"
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="text-xl font-bold text-emerald-300">
            Nueva Meta de Ahorro
          </DialogTitle>
          <p className="text-sm text-slate-400 mt-1">
            {watchedType === 'one_time' ? 'Meta con fecha límite' : 'Ahorro mensual recurrente'}
          </p>
        </DialogHeader>

        <Form {...form}>
          <form id="savings-goal-form" onSubmit={form.handleSubmit(onSubmit)} className="contents">
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
                          placeholder="Ej: Vacaciones en Brasil, Fondo de emergencia..."
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
                form="savings-goal-form"
                disabled={isPending}
                className="w-full min-h-[52px] rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-base font-semibold shadow-[0_0_24px_rgba(16,185,129,0.25)] transition-all active:scale-[0.98]"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Creando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-5 w-5" />
                    Crear Meta
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
