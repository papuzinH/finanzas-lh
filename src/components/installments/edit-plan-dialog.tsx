'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { installmentPlanSchema, type InstallmentPlanSchema } from '@/lib/schemas/installment-plan';
import { updateInstallmentPlan } from '@/app/dashboard/installments/actions';
import { formatCurrency } from '@/lib/utils';
import { useFinanceStore } from '@/lib/store/financeStore';

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
  const { fetchAllData, categories } = useFinanceStore();

  const form = useForm<InstallmentPlanSchema>({
    resolver: zodResolver(installmentPlanSchema),
    defaultValues: {
      description: plan.description,
      category_id: plan.category_id || '',
    },
  });

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
      <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0 sm:max-w-[500px] bg-slate-950 border-slate-800 text-slate-50">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
          <DialogTitle className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
            Editar Plan de Cuotas
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Solo puedes editar el nombre y la categoría. El monto y la cantidad de cuotas no se pueden modificar para mantener la integridad del historial.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="edit-plan-form" onSubmit={form.handleSubmit(onSubmit)} className="contents">
            <div className="overflow-y-auto flex-1 px-6 space-y-4">
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Descripción</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ej: Compra TV"
                        {...field}
                        className="bg-slate-900 border-slate-800 focus:border-indigo-500/50"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Categoría</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-slate-900 border-slate-800">
                          <SelectValue placeholder="Seleccionar categoría" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.emoji} {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FormLabel className="text-slate-500">Monto Total</FormLabel>
                  <Input
                    disabled
                    value={formatCurrency(plan.total_amount)}
                    className="bg-slate-900/50 border-slate-800 text-slate-500 cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2">
                  <FormLabel className="text-slate-500">Cuotas</FormLabel>
                  <Input
                    disabled
                    value={plan.installments_count.toString()}
                    className="bg-slate-900/50 border-slate-800 text-slate-500 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
          </form>
        </Form>

        <div className="px-4 sm:px-6 py-4 border-t border-slate-800 flex-shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto h-11 sm:h-9 text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="edit-plan-form"
            disabled={isPending}
            className="w-full sm:w-auto h-11 sm:h-9 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar Cambios
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
