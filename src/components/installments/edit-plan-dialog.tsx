'use client';

import { useState, useTransition } from 'react';
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
  const [isPending, startTransition] = useTransition();
  const { fetchAllData, categories } = useFinanceStore();

  const form = useForm<InstallmentPlanSchema>({
    resolver: zodResolver(installmentPlanSchema),
    defaultValues: {
      description: plan.description,
      category_id: plan.category_id || '',
    },
  });

  async function onSubmit(data: InstallmentPlanSchema) {
    startTransition(async () => {
      const result = await updateInstallmentPlan(plan.id.toString(), data);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Plan actualizado correctamente');
        await fetchAllData();
        onOpenChange(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-slate-900 border-slate-800 text-slate-200">
        <DialogHeader>
          <DialogTitle>Editar Plan de Cuotas</DialogTitle>
          <DialogDescription className="text-slate-400">
            Solo puedes editar el nombre y la categoría. El monto y la cantidad de cuotas no se pueden modificar para mantener la integridad del historial.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Ej: Compra TV" 
                      {...field} 
                      className="bg-slate-950 border-slate-800 focus-visible:ring-slate-700"
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
                  <FormLabel>Categoría</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="bg-slate-950 border-slate-800 focus:ring-slate-700">
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
                <FormLabel className="text-slate-400">Monto Total</FormLabel>
                <Input 
                  disabled 
                  value={formatCurrency(plan.total_amount)}
                  className="bg-slate-950/50 border-slate-800 text-slate-500 cursor-not-allowed"
                />
              </div>
              <div className="space-y-2">
                <FormLabel className="text-slate-400">Cuotas</FormLabel>
                <Input 
                  disabled 
                  value={plan.installments_count.toString()}
                  className="bg-slate-950/50 border-slate-800 text-slate-500 cursor-not-allowed"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-slate-700 hover:bg-slate-800 hover:text-slate-200 text-slate-300"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar Cambios
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
