'use client';

import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { Loader2, AlignLeft, ChevronRight, CheckCircle2, Wallet, Grid3X3 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { createTransactionSchema, type CreateTransactionSchema } from '@/lib/schemas/transaction';
import { createTransaction } from '@/app/dashboard/transactions/actions';
import { useFinanceStore } from '@/lib/store/financeStore';

const QUICK_AMOUNTS = [100, 500, 1000] as const;

function PaymentMethodBadge({ type }: { type: string }) {
  if (type === 'credit') {
    return (
      <span className="inline-flex items-center justify-center rounded-md bg-linear-to-r from-indigo-600 to-violet-600 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase">
        VISA
      </span>
    );
  }
  if (type === 'debit') {
    return (
      <span className="inline-flex items-center justify-center rounded-md bg-emerald-600/80 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase">
        Débito
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center rounded-md bg-slate-700 px-2 py-0.5 text-[10px] font-bold tracking-wider text-slate-300 uppercase">
      Efectivo
    </span>
  );
}

interface CreateTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues?: {
    description?: string;
    category_id?: string;
    amount?: number;
    type?: 'expense' | 'income';
  };
}

export function CreateTransactionDialog({
  open,
  onOpenChange,
  defaultValues,
}: CreateTransactionDialogProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const { fetchAllData, categories, paymentMethods, getCategoryBudgetStatus, getFrequentCategories } = useFinanceStore();

  const frequentCategories = getFrequentCategories(4);

  const form = useForm<CreateTransactionSchema>({
    resolver: zodResolver(createTransactionSchema),
    defaultValues: {
      description: defaultValues?.description ?? '',
      amount: defaultValues?.amount ?? 0,
      date: new Date(),
      category_id: defaultValues?.category_id ?? '',
      type: defaultValues?.type ?? 'expense',
      payment_method_id: 'none',
    },
  });

  const watchedAmount = form.watch('amount');
  const watchedPaymentMethodId = form.watch('payment_method_id');

  const selectedPaymentMethod = paymentMethods.find(
    (m) => m.id.toString() === watchedPaymentMethodId
  );

  // Reset form with new defaultValues each time the dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        description: defaultValues?.description ?? '',
        amount: defaultValues?.amount ?? 0,
        date: new Date(),
        category_id: defaultValues?.category_id ?? '',
        type: defaultValues?.type ?? 'expense',
        payment_method_id: 'none',
      });
      setShowAllCategories(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(data: CreateTransactionSchema) {
    setIsPending(true);
    try {
      const formattedData = {
        ...data,
        payment_method_id: data.payment_method_id === 'none' ? null : data.payment_method_id,
      };

      const result = await createTransaction(formattedData);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Movimiento creado correctamente');
        await fetchAllData();

        if (data.type === 'expense' && data.category_id) {
          const budgetStatus = getCategoryBudgetStatus(data.category_id);
          if (budgetStatus?.status === 'exceeded') {
            toast.warning(
              `🔴 Superaste el presupuesto de ${budgetStatus.categoryEmoji ?? ''} ${budgetStatus.categoryName} (${Math.round(budgetStatus.percent)}% usado)`
            );
          } else if (budgetStatus?.status === 'warning') {
            toast.warning(
              `⚠️ Cerca del límite en ${budgetStatus.categoryEmoji ?? ''} ${budgetStatus.categoryName} (${Math.round(budgetStatus.percent)}% usado)`
            );
          }
        }

        form.reset();
        onOpenChange(false);
        router.refresh();
      }
    } finally {
      setIsPending(false);
    }
  }

  // Format amount for large display
  const displayAmount = watchedAmount === 0
    ? '0.00'
    : watchedAmount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0 sm:max-w-[500px] bg-surface border-slate-800/50 text-slate-50"
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="text-xl font-bold text-indigo-300">
            Nuevo Movimiento
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form id="transaction-form" onSubmit={form.handleSubmit(onSubmit)} className="contents">
            <div className="overflow-y-auto flex-1 px-6 pb-4 space-y-5">

              {/* ── Amount Section ── */}
              <div className="flex flex-col items-center gap-3 pt-2">
                <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
                  Monto
                </span>

                {/* Large amount display + hidden input */}
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem className="w-full flex flex-col items-center">
                      <button
                        type="button"
                        className="flex items-baseline justify-center gap-1 w-full focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg"
                        onClick={() => amountInputRef.current?.focus()}
                      >
                        <span className="text-3xl font-semibold text-slate-600">$</span>
                        <span className="text-5xl sm:text-6xl font-semibold text-slate-50 tabular-nums">
                          {displayAmount}
                        </span>
                      </button>
                      <FormControl>
                        <input
                          ref={amountInputRef}
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          value={field.value || ''}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value);
                            field.onChange(isNaN(value) ? 0 : value);
                          }}
                          onBlur={field.onBlur}
                          name={field.name}
                          className="sr-only"
                          aria-label="Monto de la transacción"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Quick amount pills */}
                <div className="flex items-center gap-2">
                  {QUICK_AMOUNTS.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => form.setValue('amount', amount, { shouldValidate: true })}
                      className={cn(
                        'min-h-11 rounded-full px-5 py-2 text-sm font-medium transition-all active:scale-95',
                        'focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none',
                        watchedAmount === amount
                          ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/50'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300'
                      )}
                    >
                      ${amount}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Type Toggle ── */}
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-900/80 p-1">
                      {(['expense', 'income'] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => field.onChange(type)}
                          className={cn(
                            'min-h-11 rounded-lg py-3 text-sm font-semibold transition-all',
                            'focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none',
                            field.value === type
                              ? 'bg-indigo-500 text-white shadow-[0_0_20px_rgba(129,140,248,0.3)]'
                              : 'text-slate-500 hover:text-slate-300'
                          )}
                        >
                          {type === 'expense' ? 'Gasto' : 'Ingreso'}
                        </button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Description ── */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
                      Descripción
                    </span>
                    <FormControl>
                      <div className="relative">
                        <AlignLeft className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                        <Input
                          placeholder="Ej: Compra supermercado"
                          {...field}
                          className="pl-10 bg-surface-raised border-0 rounded-xl min-h-11 text-slate-50 placeholder:text-slate-600 focus-visible:ring-2 focus-visible:ring-indigo-500"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Quick Categories ── */}
              <FormField
                control={form.control}
                name="category_id"
                render={({ field }) => (
                  <FormItem>
                    <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
                      Categoría
                    </span>

                    {/* Quick category icons */}
                    <div className="flex items-start gap-3 justify-center pt-1">
                      {frequentCategories.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => field.onChange(cat.id)}
                          className={cn(
                            'flex flex-col items-center gap-1.5 min-w-[60px] group',
                            'focus-visible:outline-none'
                          )}
                        >
                          <div
                            className={cn(
                              'flex items-center justify-center h-14 w-14 rounded-full transition-all',
                              'focus-visible:ring-2 focus-visible:ring-indigo-500',
                              field.value === cat.id
                                ? 'bg-indigo-500/20 ring-2 ring-indigo-400 scale-105'
                                : 'bg-slate-800/60 group-hover:bg-slate-700/60'
                            )}
                          >
                            <span className="text-xl">{cat.emoji ?? '📦'}</span>
                          </div>
                          <span className={cn(
                            'text-[10px] max-w-[60px] truncate transition-colors',
                            field.value === cat.id ? 'text-indigo-300' : 'text-slate-500'
                          )}>
                            {cat.name}
                          </span>
                        </button>
                      ))}

                      {/* "More" button */}
                      <button
                        type="button"
                        onClick={() => setShowAllCategories((v) => !v)}
                        className="flex flex-col items-center gap-1.5 min-w-[60px] group focus-visible:outline-none"
                      >
                        <div className={cn(
                          'flex items-center justify-center h-14 w-14 rounded-full transition-all',
                          'bg-slate-800/60 group-hover:bg-slate-700/60',
                          showAllCategories && 'ring-2 ring-slate-600'
                        )}>
                          <Grid3X3 className="h-5 w-5 text-slate-400" />
                        </div>
                        <span className="text-[10px] text-slate-500">Más</span>
                      </button>
                    </div>

                    {/* Expanded categories grid */}
                    {showAllCategories && (
                      <div className="grid grid-cols-4 gap-2 pt-2 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                        {categories.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              field.onChange(cat.id);
                              setShowAllCategories(false);
                            }}
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

              {/* ── Payment Method ── */}
              <FormField
                control={form.control}
                name="payment_method_id"
                render={({ field }) => (
                  <FormItem>
                    <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
                      Método de pago
                    </span>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || 'none'}
                    >
                      <FormControl>
                        <SelectTrigger
                          className="w-full bg-surface-raised border-0 rounded-xl min-h-[52px] px-3 py-2 flex items-center gap-3 focus-visible:ring-2 focus-visible:ring-indigo-500 [&>svg]:hidden"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {selectedPaymentMethod ? (
                              <>
                                <PaymentMethodBadge type={selectedPaymentMethod.type} />
                                <span className="text-sm text-slate-200 truncate">
                                  {selectedPaymentMethod.name}
                                </span>
                              </>
                            ) : (
                              <>
                                <Wallet className="h-5 w-5 text-slate-500 shrink-0" />
                                <span className="text-sm text-slate-400">Sin asignar</span>
                              </>
                            )}
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-surface-overlay border-slate-800 text-slate-200">
                        <SelectItem value="none">Sin asignar</SelectItem>
                        {paymentMethods.map((method) => (
                          <SelectItem
                            key={method.id}
                            value={method.id.toString()}
                          >
                            {method.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Date ── */}
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
                      Fecha
                    </span>
                    <FormControl>
                      <Input
                        type="date"
                        value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                        onChange={(e) => field.onChange(new Date(e.target.value))}
                        className="bg-surface-raised border-0 rounded-xl min-h-11 text-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500 block w-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

            </div>

            {/* ── Submit Button ── */}
            <div className="px-6 pb-6 pt-3 shrink-0">
              <Button
                type="submit"
                form="transaction-form"
                disabled={isPending}
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
                    Crear Movimiento
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
