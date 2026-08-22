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
  /** Abierto desde afuera (menú de la card). Sin esto, el diálogo trae su botón. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Se puede usar de dos maneras: suelto, y trae su propio botón; o controlado
 * desde afuera con `open`/`onOpenChange`, que es como lo abren las cards de
 * /objetivos desde su menú de acciones (ahí la card no tiene botones propios).
 */
export function EditSavingsGoalDialog({ goal, open: controlledOpen, onOpenChange }: Props) {
  const [selfOpen, setSelfOpen] = useState(false)
  // Controlado si viene `open` por props; si no, el diálogo se maneja solo.
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : selfOpen
  const setOpen = (value: boolean) => {
    if (isControlled) onOpenChange?.(value)
    else setSelfOpen(value)
  }
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
{!isControlled && (
        <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Editar meta" className="h-11 w-11 text-muted hover:text-text hover:bg-surface-2">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      )}
      <DialogContent
        showCloseButton
        className="max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0 sm:max-w-[500px] bg-surface border-border/50 text-text"
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="text-xl font-bold text-accent-deep">
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
                    <span className="text-[10px] font-medium uppercase tracking-widest text-muted">
                      Nombre de la meta
                    </span>
                    <FormControl>
                      <div className="relative">
                        <Target className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
                        <Input
                          placeholder="Ej: Vacaciones en Brasil..."
                          {...field}
                          className="pl-10 bg-surface-2 border-0 rounded-xl min-h-11 text-text placeholder:text-faint focus-visible:ring-2 focus-visible:ring-accent"
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
                    <span className="text-[10px] font-medium uppercase tracking-widest text-muted">
                      Tipo de meta
                    </span>
                    <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
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
                            'focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
                            field.value === opt.value
                              ? 'bg-accent text-accent-ink'
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

              {/* ── Currency Toggle ── */}
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <span className="text-[10px] font-medium uppercase tracking-widest text-muted">
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
                            'focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
                            field.value === opt.value
                              ? 'bg-accent/15 text-accent-deep ring-1 ring-accent/50'
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

              {/* ── Target Date (only for one_time) ── */}
              {watchedType === 'one_time' && (
                <FormField
                  control={form.control}
                  name="target_date"
                  render={({ field }) => (
                    <FormItem>
                      <span className="text-[10px] font-medium uppercase tracking-widest text-muted">
                        Fecha objetivo
                      </span>
                      <FormControl>
                        <Input
                          type="date"
                          value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                          onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : null)}
                          className="bg-surface-2 border-0 rounded-xl min-h-11 text-text focus-visible:ring-2 focus-visible:ring-accent block w-full"
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
                className="w-full min-h-[52px] rounded-xl bg-accent hover:bg-accent-deep text-accent-ink text-base font-semibold transition-all active:scale-[0.98]"
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
