'use client';

import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
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
import { createInstallmentPlanSchema, type CreateInstallmentPlanSchema } from '@/lib/schemas/installment-plan';
import { createInstallmentPlan } from '@/app/dashboard/installments/actions';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency } from '@/lib/utils';

interface CreateInstallmentPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateInstallmentPlanDialog({
  open,
  onOpenChange,
}: CreateInstallmentPlanDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { fetchAllData, categories, paymentMethods } = useFinanceStore();

  const form = useForm<CreateInstallmentPlanSchema>({
    resolver: zodResolver(createInstallmentPlanSchema),
    defaultValues: {
      description: '',
      total_amount: 0,
      installments_count: 1,
      purchase_date: new Date(),
      category_id: '',
      payment_method_id: 'none',
    },
  });

  const totalAmount = form.watch('total_amount');
  const installmentsCount = form.watch('installments_count');
  const installmentValue = totalAmount > 0 && installmentsCount > 0
    ? totalAmount / installmentsCount
    : 0;

  async function onSubmit(data: CreateInstallmentPlanSchema) {
    startTransition(async () => {
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
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-slate-900 border-slate-800 text-slate-200">
        <DialogHeader>
          <DialogTitle>Nuevo Plan de Cuotas</DialogTitle>
          <DialogDescription className="text-slate-400">
            Se crearán automáticamente las transacciones mensuales asociadas.
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
                      placeholder="Ej: Compra TV Samsung"
                      {...field}
                      className="bg-slate-950 border-slate-800 focus-visible:ring-slate-700"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="total_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto Total</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value);
                          field.onChange(isNaN(value) ? 0 : value);
                        }}
                        className="bg-slate-950 border-slate-800 focus-visible:ring-slate-700"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="installments_count"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cantidad de Cuotas</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        placeholder="12"
                        {...field}
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          field.onChange(isNaN(value) ? 1 : value);
                        }}
                        className="bg-slate-950 border-slate-800 focus-visible:ring-slate-700"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {installmentValue > 0 && (
              <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-4 py-3 text-center">
                <p className="text-[10px] text-indigo-300 uppercase tracking-wider mb-0.5">Valor por cuota</p>
                <p className="text-lg font-bold text-indigo-400 font-mono">{formatCurrency(installmentValue)}</p>
              </div>
            )}

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

            <FormField
              control={form.control}
              name="payment_method_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Método de pago</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || 'none'}
                  >
                    <FormControl>
                      <SelectTrigger className="bg-slate-950 border-slate-800 focus:ring-slate-700">
                        <SelectValue placeholder="Selecciona un método de pago" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
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

            <FormField
              control={form.control}
              name="purchase_date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Fecha de compra</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                      onChange={(e) => field.onChange(new Date(e.target.value))}
                      className="bg-slate-950 border-slate-800 focus-visible:ring-slate-700 block w-full"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                Crear Plan
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
