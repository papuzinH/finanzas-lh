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
import { createInstallmentPlanSchema, type CreateInstallmentPlanSchema } from '@/lib/schemas/installment-plan';
import { todayString } from '@/lib/utils/dates';
import { createInstallmentPlan } from '@/app/dashboard/installments/actions';
import { useFinanceStore } from '@/lib/store/financeStore';
import {
  AmountField,
  InstallmentSelector,
  DescriptionField,
  CategoryPicker,
  DateField,
  PaymentMethodField,
} from '@/components/transactions/transaction-form-fields';

interface CreateInstallmentPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateInstallmentPlanDialog({
  open,
  onOpenChange,
}: CreateInstallmentPlanDialogProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const { fetchAllData, categories, paymentMethods, getFrequentCategories, isInitialized } = useFinanceStore();

  const frequentCategories = getFrequentCategories(4);

  const form = useForm<CreateInstallmentPlanSchema>({
    resolver: zodResolver(createInstallmentPlanSchema),
    defaultValues: {
      description: '',
      total_amount: 0,
      installments_count: 2,
      purchase_date: todayString(),
      category_id: '',
      payment_method_id: 'none',
    },
  });

  const watchedAmount = form.watch('total_amount');
  const watchedCount = form.watch('installments_count');
  const watchedDate = form.watch('purchase_date');

  // Reset form each time the dialog opens
  useEffect(() => {
    if (open) {
      if (!isInitialized) {
        fetchAllData();
      }
      form.reset({
        description: '',
        total_amount: 0,
        installments_count: 2,
        purchase_date: todayString(),
        category_id: '',
        payment_method_id: 'none',
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(data: CreateInstallmentPlanSchema) {
    setIsPending(true);
    try {
      const formattedData = {
        ...data,
        payment_method_id: data.payment_method_id === 'none' ? null : data.payment_method_id,
      };

      const result = await createInstallmentPlan(formattedData);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Plan de cuotas creado correctamente');
        await fetchAllData();
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
        className="max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0 sm:max-w-[500px] bg-surface border-slate-800/50 text-slate-50"
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="text-xl font-bold text-indigo-300">
            Nuevo Plan de Cuotas
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form id="installment-form" onSubmit={form.handleSubmit(onSubmit)} className="contents">
            <div className="overflow-y-auto flex-1 px-6 pb-4 space-y-5">

              {/* ── Amount ── */}
              <AmountField
                control={form.control}
                setValue={form.setValue}
                watchedAmount={watchedAmount}
                fieldName="total_amount"
              />

              {/* ── Installment Selector ── */}
              <InstallmentSelector
                control={form.control}
                setValue={form.setValue}
                watchedCount={watchedCount}
                watchedAmount={watchedAmount}
              />

              {/* ── Description ── */}
              <DescriptionField control={form.control} />

              {/* ── Categories ── */}
              <CategoryPicker
                control={form.control}
                categories={categories}
                frequentCategories={frequentCategories}
              />

              {/* ── Date ── */}
              <DateField
                control={form.control}
                fieldName="purchase_date"
                label="Fecha de compra"
              />

              {/* ── Payment Method ── */}
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
                form="installment-form"
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
                    Crear Plan
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
