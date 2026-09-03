'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { transactionSchema, type TransactionSchema } from '@/lib/schemas/transaction';
import { updateTransaction } from '@/app/dashboard/transactions/actions';
import { useFinanceStore } from '@/lib/store/financeStore';
import { resolverImputacion } from '@/lib/finance/imputacion-ingresos';
import {
  AmountField,
  TypeToggle,
  DescriptionField,
  CategoryPicker,
  DateField,
  CurrencyField,
  PaymentMethodField,
  DEFAULT_RATE_PAIR,
} from '@/components/transactions/transaction-form-fields';
import { MesDelCobroField } from '@/components/transactions/mes-del-cobro-field';

interface EditTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: {
    id: string;
    description: string;
    amount: number;
    date: string;
    category_id: string | null;
    type: 'expense' | 'income' | null;
    payment_method_id?: string | null;
    original_currency?: string | null;
    original_amount?: number | null;
    rate_pair?: string | null;
    income_period?: string | null;
  };
}

export function EditTransactionDialog({
  open,
  onOpenChange,
  transaction,
}: EditTransactionDialogProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const { fetchAllData, categories, paymentMethods, getFrequentCategories, getExchangeRate } = useFinanceStore();
  const store = useFinanceStore();

  const initialPaymentMethodId =
    transaction.payment_method_id != null ? String(transaction.payment_method_id) : 'none';

  const form = useForm<TransactionSchema>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      description: transaction.description,
      amount: transaction.original_currency === 'USD' && transaction.original_amount != null
        ? Math.abs(transaction.original_amount)
        : Math.abs(transaction.amount),
      date: transaction.date,
      category_id: transaction.category_id || '',
      type: transaction.type || 'expense',
      payment_method_id: initialPaymentMethodId,
      income_period: transaction.income_period ?? null,
      currency: (transaction.original_currency === 'USD' ? 'USD' : 'ARS') as 'ARS' | 'USD',
      rate_pair: transaction.rate_pair ?? null,
      exchange_rate: null,
    },
  });

  const watchedAmount = form.watch('amount');
  const watchedCurrency = form.watch('currency');
  const watchedRatePair = form.watch('rate_pair');
  const watchedDate = form.watch('date');
  const watchedType = form.watch('type');
  const watchedPaymentMethodId = form.watch('payment_method_id');

  const categoriesForType = categories.filter((c) => c.type === watchedType);
  const frequentCategories = getFrequentCategories(4, watchedType);
  // Un reintegro en tarjeta ya tiene cycle_id, y el ciclo le gana a income_period
  // en prepare.ts: mostrar el selector ahi es un control que no hace nada.
  const medioEsCredito = paymentMethods.find((pm) => pm.id === watchedPaymentMethodId)?.type === 'credit';

  // Reset form when dialog opens with fresh transaction data
  useEffect(() => {
    if (open) {
      form.reset({
        description: transaction.description,
        amount: transaction.original_currency === 'USD' && transaction.original_amount != null
          ? Math.abs(transaction.original_amount)
          : Math.abs(transaction.amount),
        date: transaction.date,
        category_id: transaction.category_id || '',
        type: transaction.type || 'expense',
        payment_method_id: initialPaymentMethodId,
        income_period: transaction.income_period ?? null,
        currency: (transaction.original_currency === 'USD' ? 'USD' : 'ARS') as 'ARS' | 'USD',
        rate_pair: transaction.rate_pair ?? null,
        exchange_rate: null,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(data: TransactionSchema) {
    setIsPending(true);
    try {
      const isUsd = data.currency === 'USD';
      const ratePair = data.rate_pair || DEFAULT_RATE_PAIR;
      // Se DERIVA de la fecha final, no se retiene lo que el form traiga: si el
      // usuario cambió la fecha después de elegir un mes, resolverImputacion
      // descarta un `income_period` que ya no está entre los candidatos de la
      // fecha actual y cae al default, en vez de persistir un mes huérfano.
      const incomePeriod =
        data.type === 'income'
          ? resolverImputacion(data.date, data.income_period, store.incomeCountsNextMonth)
          : null;
      const payload = {
        ...data,
        payment_method_id: data.payment_method_id === 'none' ? null : data.payment_method_id,
        income_period: incomePeriod,
        rate_pair: isUsd ? ratePair : null,
        exchange_rate: isUsd ? getExchangeRate(ratePair) : null,
      };
      const result = await updateTransaction(transaction.id.toString(), payload);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Transacción actualizada correctamente');
        await fetchAllData();
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
          <DialogTitle className="text-xl font-bold text-accent-deep">
            Editar Movimiento
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form id="edit-transaction-form" onSubmit={form.handleSubmit(onSubmit)} className="contents">
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

              {/* ── Date ── */}
              <DateField control={form.control} />

              {/* ── A qué mes cuenta (sólo ingresos que no van a tarjeta, sólo en el borde del mes) ── */}
              {watchedType === 'income' && !medioEsCredito && (
                <MesDelCobroField
                  fecha={watchedDate}
                  value={resolverImputacion(watchedDate, form.watch('income_period'), store.incomeCountsNextMonth)}
                  onChange={(v) => form.setValue('income_period', v)}
                />
              )}

              {/* ── Payment method ── */}
              <PaymentMethodField
                control={form.control}
                paymentMethods={paymentMethods}
                watchedDate={watchedDate}
              />

            </div>

            {/* ── Submit Button ── */}
            <div className="px-6 pb-6 pt-3 shrink-0">
              <Button
                type="submit"
                form="edit-transaction-form"
                disabled={isPending}
                className="w-full min-h-[52px] rounded-xl bg-accent hover:bg-accent-deep text-accent-ink text-base font-semibold transition-all active:scale-[0.98]"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-5 w-5" />
                    Guardar Cambios
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
