'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus } from 'lucide-react';
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
import { createSubscriptionSchema, type CreateSubscriptionSchema } from '@/lib/schemas/subscription';
import { todayString, parseLocalDate } from '@/lib/utils/dates';
import { createSubscription } from '@/app/dashboard/subscriptions/actions';
import { useFinanceStore } from '@/lib/store/financeStore';
import {
  AmountField,
  DescriptionField,
  CategoryPicker,
  DateField,
  FrequencySelector,
  PaymentMethodField,
  CurrencyField,
  DEFAULT_RATE_PAIR,
} from '@/components/transactions/transaction-form-fields';

interface CreateSubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateSubscriptionDialog({
  open,
  onOpenChange,
}: CreateSubscriptionDialogProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const { fetchAllData, categories, paymentMethods, getFrequentCategories } = useFinanceStore();

  const frequentCategories = getFrequentCategories(4);

  const form = useForm<CreateSubscriptionSchema>({
    resolver: zodResolver(createSubscriptionSchema),
    defaultValues: {
      description: '',
      amount: 0,
      category_id: '',
      payment_method_id: 'none',
      start_date: todayString(),
      frequency: 'monthly',
      currency: 'ARS',
      rate_pair: null,
      exchange_rate: null,
    },
  });

  const watchedAmount = form.watch('amount');
  const watchedStartDate = form.watch('start_date');
  const watchedPaymentMethodId = form.watch('payment_method_id');
  const watchedDebitDay = form.watch('debit_payment_day');
  const watchedFrequency = form.watch('frequency');
  const watchedCurrency = form.watch('currency');
  const watchedRatePair = form.watch('rate_pair');
  const getExchangeRate = useFinanceStore((s) => s.getExchangeRate);

  async function onSubmit(data: CreateSubscriptionSchema) {
    setIsPending(true);
    try {
      const isUsd = data.currency === 'USD';
      const ratePair = data.rate_pair || DEFAULT_RATE_PAIR;
      const formattedData = {
        ...data,
        payment_method_id: data.payment_method_id === 'none' ? null : data.payment_method_id,
        rate_pair: isUsd ? ratePair : null,
        exchange_rate: isUsd ? getExchangeRate(ratePair) : null,
      };

      const result = await createSubscription(formattedData);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Gasto fijo creado correctamente');
        await fetchAllData();
        form.reset({
          description: '',
          amount: 0,
          category_id: '',
          payment_method_id: 'none',
          start_date: todayString(),
          frequency: 'monthly',
        });
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
        className="max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0 sm:max-w-[500px] bg-surface border-slate-800/50 text-slate-50"
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="text-xl font-bold text-violet-300">
            Nuevo Gasto Fijo
          </DialogTitle>
          <p className="text-sm text-slate-400 mt-1">
            {watchedFrequency === 'monthly' ? 'Mensual' : 'Anual'} · {' '}
            Inicia {watchedStartDate
              ? parseLocalDate(watchedStartDate).toLocaleDateString('es-AR', {
                  day: '2-digit',
                  month: 'short',
                })
              : 'hoy'}
          </p>
        </DialogHeader>

        <Form {...form}>
          <form id="subscription-form" onSubmit={form.handleSubmit(onSubmit)} className="contents">
            <div className="overflow-y-auto flex-1 px-6 pb-4 space-y-5">

              {/* ── Amount ── */}
              <AmountField<CreateSubscriptionSchema>
                control={form.control}
                setValue={form.setValue}
                watchedAmount={watchedAmount}
                fieldName="amount"
                currency={watchedCurrency}
              />

              {/* ── Currency ── */}
              <CurrencyField<CreateSubscriptionSchema>
                control={form.control}
                setValue={form.setValue}
                watchedCurrency={watchedCurrency}
                watchedRatePair={watchedRatePair}
                watchedAmount={watchedAmount}
              />

              {/* ── Description ── */}
              <DescriptionField<CreateSubscriptionSchema>
                control={form.control}
              />

              {/* ── Category ── */}
              <CategoryPicker<CreateSubscriptionSchema>
                control={form.control}
                categories={categories}
                frequentCategories={frequentCategories}
              />

              {/* ── Start Date ── */}
              <DateField<CreateSubscriptionSchema>
                control={form.control}
                fieldName="start_date"
                label="Fecha de inicio"
              />

              {/* ── Frequency ── */}
              <FrequencySelector<CreateSubscriptionSchema>
                control={form.control}
              />

              {/* ── Payment Method ── */}
              <PaymentMethodField<CreateSubscriptionSchema>
                control={form.control}
                setValue={form.setValue}
                paymentMethods={paymentMethods}
                fieldName="payment_method_id"
                debitFieldName="debit_payment_day"
                dateFieldName="start_date"
                watchedDate={watchedStartDate}
                watchedDebitDay={watchedDebitDay}
              />

            </div>

            {/* ── Submit Button ── */}
            <div className="px-6 pb-6 pt-3 shrink-0">
              <Button
                type="submit"
                form="subscription-form"
                disabled={isPending}
                className="w-full min-h-[52px] rounded-xl bg-violet-500 hover:bg-violet-600 text-white text-base font-semibold shadow-[0_0_24px_rgba(139,92,246,0.25)] transition-all active:scale-[0.98]"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Creando...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-5 w-5" />
                    Crear {watchedFrequency === 'monthly' ? 'Gasto Mensual' : 'Gasto Anual'}
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
