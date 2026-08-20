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
import { Form } from '@/components/ui/form';
import { subscriptionSchema, type SubscriptionSchema } from '@/lib/schemas/subscription';
import { updateSubscription } from '@/app/dashboard/subscriptions/actions';
import { useFinanceStore } from '@/lib/store/financeStore';
import {
  AmountField,
  DescriptionField,
  CategoryPicker,
  FrequencySelector,
  PaymentMethodField,
  CurrencyField,
  DEFAULT_RATE_PAIR,
} from '@/components/transactions/transaction-form-fields';

interface EditSubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: {
    id: string;
    description: string;
    amount: number;
    is_active: boolean | null;
    category_id: string | null;
    payment_method_id: string | null;
    frequency?: string | null;
    debit_payment_day?: number | null;
    currency?: string | null;
    original_amount?: number | null;
    rate_pair?: string | null;
  };
}

export function EditSubscriptionDialog({
  open,
  onOpenChange,
  subscription,
}: EditSubscriptionDialogProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const { fetchAllData, categories, paymentMethods, getFrequentCategories, getExchangeRate } = useFinanceStore();

  const frequentCategories = getFrequentCategories(4, 'expense');

  const form = useForm<SubscriptionSchema>({
    resolver: zodResolver(subscriptionSchema),
    defaultValues: {
      description: subscription.description,
      amount: subscription.currency === 'USD' && subscription.original_amount != null
        ? subscription.original_amount
        : subscription.amount,
      is_active: subscription.is_active ?? true,
      category_id: subscription.category_id || "",
      payment_method_id: subscription.payment_method_id ? String(subscription.payment_method_id) : "none",
      frequency: (subscription.frequency === 'monthly' || subscription.frequency === 'yearly') ? subscription.frequency : 'monthly',
      debit_payment_day: subscription.debit_payment_day || undefined,
      currency: (subscription.currency === 'USD' ? 'USD' : 'ARS') as 'ARS' | 'USD',
      rate_pair: subscription.rate_pair ?? null,
      exchange_rate: null,
    },
  });

  const watchedAmount = form.watch('amount');
  const watchedDebitDay = form.watch('debit_payment_day');
  const watchedFrequency = form.watch('frequency');
  const watchedCurrency = form.watch('currency');
  const watchedRatePair = form.watch('rate_pair');

  // Reset form when subscription changes
  useEffect(() => {
    if (open) {
      form.reset({
        description: subscription.description,
        amount: subscription.currency === 'USD' && subscription.original_amount != null
          ? subscription.original_amount
          : subscription.amount,
        is_active: subscription.is_active ?? true,
        category_id: subscription.category_id || "",
        payment_method_id: subscription.payment_method_id ? String(subscription.payment_method_id) : "none",
        frequency: (subscription.frequency === 'monthly' || subscription.frequency === 'yearly') ? subscription.frequency : 'monthly',
        debit_payment_day: subscription.debit_payment_day || undefined,
        currency: (subscription.currency === 'USD' ? 'USD' : 'ARS') as 'ARS' | 'USD',
        rate_pair: subscription.rate_pair ?? null,
        exchange_rate: null,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subscription.id]);

  async function onSubmit(data: SubscriptionSchema) {
    setIsPending(true);
    try {
      // Clean "none" values before sending
      const isUsd = data.currency === 'USD';
      const ratePair = data.rate_pair || DEFAULT_RATE_PAIR;
      const formattedData = {
        ...data,
        category_id: data.category_id || "",
        payment_method_id: data.payment_method_id === "none" ? null : data.payment_method_id,
        rate_pair: isUsd ? ratePair : null,
        exchange_rate: isUsd ? getExchangeRate(ratePair) : null,
      };

      const result = await updateSubscription(subscription.id.toString(), formattedData);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Suscripción actualizada correctamente');
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
            Editar Suscripción
          </DialogTitle>
          <p className="text-sm text-muted mt-1">
            {watchedFrequency === 'monthly' ? 'Mensual' : 'Anual'}
            {subscription.is_active === false && ' · Pausada'}
          </p>
        </DialogHeader>

        <Form {...form}>
          <form id="edit-subscription-form" onSubmit={form.handleSubmit(onSubmit)} className="contents">
            <div className="overflow-y-auto flex-1 px-6 pb-4 space-y-5">

              {/* ── Amount ── */}
              <AmountField<SubscriptionSchema>
                control={form.control}
                setValue={form.setValue}
                watchedAmount={watchedAmount}
                fieldName="amount"
                currency={watchedCurrency}
              />

              {/* ── Currency ── */}
              <CurrencyField<SubscriptionSchema>
                control={form.control}
                setValue={form.setValue}
                watchedCurrency={watchedCurrency}
                watchedRatePair={watchedRatePair}
                watchedAmount={watchedAmount}
              />

              {/* ── Description ── */}
              <DescriptionField<SubscriptionSchema>
                control={form.control}
              />

              {/* ── Category ── */}
              <CategoryPicker<SubscriptionSchema>
                control={form.control}
                categories={categories.filter((c) => c.type === 'expense')}
                frequentCategories={frequentCategories}
              />

              {/* ── Frequency ── */}
              <FrequencySelector<SubscriptionSchema>
                control={form.control}
              />

              {/* ── Payment Method ── */}
              <PaymentMethodField<SubscriptionSchema>
                control={form.control}
                setValue={form.setValue}
                paymentMethods={paymentMethods}
                fieldName="payment_method_id"
                debitFieldName="debit_payment_day"
                watchedDebitDay={watchedDebitDay}
              />

            </div>

            {/* ── Submit Button ── */}
            <div className="px-6 pb-6 pt-3 shrink-0">
              <Button
                type="submit"
                form="edit-subscription-form"
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
                    <CheckCircle2 className="mr-2 h-5 w-5" />
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