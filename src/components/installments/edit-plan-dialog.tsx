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
import { installmentPlanSchema, type InstallmentPlanSchema } from '@/lib/schemas/installment-plan';
import { updateInstallmentPlan } from '@/app/dashboard/installments/actions';
import { formatCurrency } from '@/lib/utils';
import { useFinanceStore } from '@/lib/store/financeStore';
import {
  DescriptionField,
  CategoryPicker,
} from '@/components/transactions/transaction-form-fields';

interface EditInstallmentPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: {
    id: number;
    description: string;
    total_amount: number;
    installments_count: number;
    category_id: string | null;
  };
}

export function EditInstallmentPlanDialog({
  open,
  onOpenChange,
  plan,
}: EditInstallmentPlanDialogProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const { fetchAllData, categories, getFrequentCategories } = useFinanceStore();

  const frequentCategories = getFrequentCategories(4);
  const installmentValue = plan.total_amount / plan.installments_count;

  const form = useForm<InstallmentPlanSchema>({
    resolver: zodResolver(installmentPlanSchema),
    defaultValues: {
      description: plan.description,
      category_id: plan.category_id || '',
    },
  });

  // Reset form when plan changes
  useEffect(() => {
    if (open) {
      form.reset({
        description: plan.description,
        category_id: plan.category_id || '',
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plan.id]);

  async function onSubmit(data: InstallmentPlanSchema) {
    setIsPending(true);
    try {
      const result = await updateInstallmentPlan(plan.id.toString(), data);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Plan actualizado correctamente');
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
            Editar Plan de Cuotas
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form id="edit-plan-form" onSubmit={form.handleSubmit(onSubmit)} className="contents">
            <div className="overflow-y-auto flex-1 px-6 pb-4 space-y-5">

              {/* ── Readonly Amount Display ── */}
              <div className="flex flex-col items-center gap-1 pt-2">
                <span className="text-[10px] font-medium uppercase tracking-widest text-muted">
                  Monto Total
                </span>
                <span className="text-4xl sm:text-5xl font-semibold text-text/60 tabular-nums">
                  {formatCurrency(plan.total_amount)}
                </span>
              </div>

              {/* ── Readonly Installments Info ── */}
              <div className="flex justify-center">
                <div className="rounded-full bg-surface-2 border border-border px-4 py-2 text-center">
                  <span className="text-sm text-muted">
                    {plan.installments_count} cuotas de{' '}
                    <span className="font-semibold text-text">
                      {formatCurrency(installmentValue)}
                    </span>
                  </span>
                </div>
              </div>

              {/* ── Description ── */}
              <DescriptionField control={form.control} />

              {/* ── Categories ── */}
              <CategoryPicker
                control={form.control}
                categories={categories}
                frequentCategories={frequentCategories}
              />

            </div>

            {/* ── Submit Button ── */}
            <div className="px-6 pb-6 pt-3 shrink-0">
              <Button
                type="submit"
                form="edit-plan-form"
                disabled={isPending}
                className="w-full min-h-[52px] rounded-xl bg-accent hover:bg-accent-deep text-accent-ink text-base font-semibold shadow-offset transition-all active:scale-[0.98]"
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
