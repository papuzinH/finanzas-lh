'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, CheckCircle2 } from 'lucide-react';
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
} from '@/components/ui/form';
import { createTransactionSchema, type CreateTransactionSchema } from '@/lib/schemas/transaction';
import { todayString } from '@/lib/utils/dates';
import { createTransaction } from '@/app/dashboard/transactions/actions';
import { useFinanceStore } from '@/lib/store/financeStore';
import { mesPorDefecto, necesitaDeclararMes } from '@/lib/finance/imputacion-ingresos';
import {
  AmountField,
  TypeToggle,
  DescriptionField,
  CategoryPicker,
  DateField,
  PaymentMethodField,
  CurrencyField,
  DEFAULT_RATE_PAIR,
} from '@/components/transactions/transaction-form-fields';
import { MesDelCobroField } from '@/components/transactions/mes-del-cobro-field';

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
  const { fetchAllData, categories, paymentMethods, getCategoryBudgetStatus, getFrequentCategories, getDefaultPaymentMethod, isInitialized } = useFinanceStore();
  const store = useFinanceStore();

  const defaultPmId = getDefaultPaymentMethod()?.id != null
    ? String(getDefaultPaymentMethod()!.id)
    : 'none';

  const form = useForm<CreateTransactionSchema>({
    resolver: zodResolver(createTransactionSchema),
    defaultValues: {
      description: defaultValues?.description ?? '',
      amount: defaultValues?.amount ?? 0,
      date: todayString(),
      category_id: defaultValues?.category_id ?? '',
      type: defaultValues?.type ?? 'expense',
      payment_method_id: defaultPmId,
      income_period: null,
      currency: 'ARS',
      rate_pair: null,
      exchange_rate: null,
    },
  });

  const watchedAmount = form.watch('amount');
  const watchedDate = form.watch('date');
  const watchedCurrency = form.watch('currency');
  const watchedRatePair = form.watch('rate_pair');
  const watchedType = form.watch('type');
  const getExchangeRate = useFinanceStore((s) => s.getExchangeRate);

  const categoriesForType = categories.filter((c) => c.type === watchedType);
  const frequentCategories = getFrequentCategories(4, watchedType);

  // Reset form with new defaultValues each time the dialog opens
  useEffect(() => {
    if (open) {
      if (!isInitialized) {
        fetchAllData();
      }
      form.reset({
        description: defaultValues?.description ?? '',
        amount: defaultValues?.amount ?? 0,
        date: todayString(),
        category_id: defaultValues?.category_id ?? '',
        type: defaultValues?.type ?? 'expense',
        payment_method_id: defaultPmId,
        income_period: null,
        currency: 'ARS',
        rate_pair: null,
        exchange_rate: null,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(data: CreateTransactionSchema) {
    setIsPending(true);
    try {
      const isUsd = data.currency === 'USD';
      const ratePair = data.rate_pair || DEFAULT_RATE_PAIR;
      // Guardar el formulario con el selector a la vista es el gesto de confirmación:
      // si la fecha cae en el borde y el usuario no tocó el campo, se completa acá con
      // el mismo valor que ya se le estaba mostrando (mesPorDefecto), para no persistir
      // `income_period: null` con un mes visiblemente marcado en pantalla.
      const incomePeriod =
        data.type === 'income'
          ? data.income_period ?? (necesitaDeclararMes(data.date) ? mesPorDefecto(data.date, store.incomeCountsNextMonth) : null)
          : null;
      const formattedData = {
        ...data,
        payment_method_id: data.payment_method_id === 'none' ? null : data.payment_method_id,
        income_period: incomePeriod,
        rate_pair: isUsd ? ratePair : null,
        exchange_rate: isUsd ? getExchangeRate(ratePair) : null,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0 sm:max-w-[500px] bg-surface border-border text-text"
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="font-display text-text text-[18px]">
            Nuevo Movimiento
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form id="transaction-form" onSubmit={form.handleSubmit(onSubmit)} className="contents">
            <div className="overflow-y-auto flex-1 px-6 pb-4 space-y-5">

              {/* ── Amount ── */}
              <AmountField
                control={form.control}
                setValue={form.setValue}
                watchedAmount={watchedAmount}
                currency={watchedCurrency}
                type={watchedType}
              />

              {/* ── Currency ── */}
              <CurrencyField
                control={form.control}
                setValue={form.setValue}
                watchedCurrency={watchedCurrency}
                watchedRatePair={watchedRatePair}
                watchedAmount={watchedAmount}
              />

              {/* ── Type Toggle ── */}
              <TypeToggle
                control={form.control}
                onTypeChange={() => form.setValue('category_id', '')}
              />

              {/* ── Description ── */}
              <DescriptionField control={form.control} />

              {/* ── Categories ── */}
              <CategoryPicker
                control={form.control}
                categories={categoriesForType}
                frequentCategories={frequentCategories}
              />

              {/* ── Payment Method ── */}
              <PaymentMethodField
                control={form.control}
                paymentMethods={paymentMethods}
                watchedDate={watchedDate}
              />

              {/* ── Date ── */}
              <DateField control={form.control} />

              {/* ── A qué mes cuenta (sólo ingresos, sólo en el borde del mes) ── */}
              {watchedType === 'income' && (
                <MesDelCobroField
                  fecha={watchedDate}
                  value={
                    form.watch('income_period') ??
                    // Guard: un <input type="date"> nativo se puede vaciar (Backspace).
                    // mesPorDefecto('') hace format() sobre una fecha invalida y explota;
                    // necesitaDeclararMes('') no -- y si es false el campo ni se muestra.
                    (necesitaDeclararMes(watchedDate)
                      ? mesPorDefecto(watchedDate, store.incomeCountsNextMonth)
                      : null)
                  }
                  onChange={(v) => form.setValue('income_period', v)}
                />
              )}

            </div>

            {/* ── Submit Button ── */}
            <div className="px-6 pb-6 pt-3 shrink-0">
              <Button
                type="submit"
                form="transaction-form"
                variant="accent"
                size="lg"
                disabled={isPending}
                className="w-full"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Creando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5" />
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
