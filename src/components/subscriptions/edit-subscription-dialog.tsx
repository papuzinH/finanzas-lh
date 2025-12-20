'use client';

import { useEffect, useState, useTransition } from 'react';
import { useForm, FieldErrors } from 'react-hook-form';
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
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { subscriptionSchema, type SubscriptionSchema } from '@/lib/schemas/subscription';
import { updateSubscription } from '@/app/dashboard/subscriptions/actions';
import { useFinanceStore } from '@/lib/store/financeStore';

interface EditSubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: {
    id: string | number;
    description: string;
    amount: number;
    is_active: boolean | null;
    category_id: string | null;
    payment_method_id: string | null;
  };
}



export function EditSubscriptionDialog({
  open,
  onOpenChange,
  subscription,
}: EditSubscriptionDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { fetchAllData, paymentMethods, categories } = useFinanceStore();

  const form = useForm<SubscriptionSchema>({
    resolver: zodResolver(subscriptionSchema),
    defaultValues: {
      description: subscription.description,
      amount: Math.abs(subscription.amount),
      is_active: subscription.is_active ?? true,
      category_id: subscription.category_id || "none",
      payment_method_id: subscription.payment_method_id || "none",
    },
  });

  // Actualizar el formulario cuando cambie la suscripción o se abra el diálogo
  useEffect(() => {
    if (open) {
      form.reset({
        description: subscription.description,
        amount: Math.abs(subscription.amount),
        is_active: subscription.is_active ?? true,
        category_id: subscription.category_id || "none",
        payment_method_id: subscription.payment_method_id || "none",
      });
    }
  }, [subscription, open, form]);
  

  async function onSubmit(data: SubscriptionSchema) {
    startTransition(async () => {
      // Limpiar valores "none" antes de enviar
      const formattedData = {
        ...data,
        category_id: data.category_id === "none" ? null : data.category_id,
        payment_method_id: data.payment_method_id === "none" ? null : data.payment_method_id,
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
    });
  }

  const onInvalid = (errors: FieldErrors<SubscriptionSchema>) => {
    console.error('Validation errors:', errors);
    toast.error('Por favor revisa los campos. Asegúrate de que el monto sea válido.');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-slate-900 border-slate-800 text-slate-200">
        <DialogHeader>
          <DialogTitle>Editar Suscripción</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-4">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del servicio</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Ej: Netflix" 
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
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monto mensual</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      {...field}
                      onChange={(e) => {
                        const value = e.target.value;
                        const numberValue = parseFloat(value);
                        // Si es vacío o inválido, pasamos 0 (o undefined si el schema lo permitiera, pero requiere number)
                        // Al ser 0, fallará la validación .positive() si es requerido, mostrando el error correcto.
                        field.onChange(isNaN(numberValue) ? 0 : numberValue);
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
              name="category_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoría</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || "none"}
                  >
                    <FormControl>
                      <SelectTrigger className="bg-slate-950 border-slate-800 focus:ring-slate-700">
                        <SelectValue placeholder="Seleccionar categoría" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                      <SelectItem value="none">Sin categoría</SelectItem>
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
                    value={field.value || "none"}
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
                          className="focus:bg-slate-800 focus:text-slate-200"
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
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-slate-800 p-4 bg-slate-950/50">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Estado Activo</FormLabel>
                    <FormDescription className="text-slate-500 text-xs">
                      Desactiva para pausar esta suscripción sin eliminarla.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
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
                Guardar Cambios
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
