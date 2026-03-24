'use client';

import { useState, useEffect } from 'react';
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { createTransactionSchema, type CreateTransactionSchema } from '@/lib/schemas/transaction';
import { createTransaction } from '@/app/dashboard/transactions/actions';
import { useFinanceStore } from '@/lib/store/financeStore';

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
  const { fetchAllData, categories, paymentMethods, getCategoryBudgetStatus } = useFinanceStore();

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0 sm:max-w-[500px] bg-surface-overlay border-slate-800 text-slate-50">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
          <DialogTitle className="text-xl font-bold bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
            Nuevo Movimiento
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Registra un ingreso o gasto puntual en tu cuenta.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="transaction-form" onSubmit={form.handleSubmit(onSubmit)} className="contents">
            <div className="overflow-y-auto flex-1 px-6 space-y-4">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: Compra supermercado"
                      {...field}
                      className="bg-surface-raised border-slate-800 focus:border-indigo-500/50"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto</FormLabel>
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
                        className="bg-surface-raised border-slate-800 focus:border-indigo-500/50"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-surface-raised border-slate-800">
                          <SelectValue placeholder="Seleccionar tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-surface-overlay border-slate-800 text-slate-200">
                        <SelectItem value="expense">Gasto</SelectItem>
                        <SelectItem value="income">Ingreso</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                      <SelectTrigger className="bg-surface-raised border-slate-800">
                        <SelectValue placeholder="Seleccionar categoría" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-surface-overlay border-slate-800 text-slate-200">
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
                      <SelectTrigger className="bg-surface-raised border-slate-800">
                        <SelectValue placeholder="Selecciona un método de pago" />
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

            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Fecha</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                      onChange={(e) => field.onChange(new Date(e.target.value))}
                      className="bg-surface-raised border-slate-800 focus:border-indigo-500/50 block w-full"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
            form="transaction-form"
            disabled={isPending}
            className="w-full sm:w-auto h-11 sm:h-9 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Crear Movimiento
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
