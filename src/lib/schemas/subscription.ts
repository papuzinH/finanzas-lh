import { z } from 'zod';

export const subscriptionSchema = z.object({
  description: z.string().min(3, 'La descripción debe tener al menos 3 caracteres'),
  amount: z.number().positive('El monto debe ser positivo'),
  is_active: z.boolean(),
  category: z.string().optional(),
  payment_method_id: z.number().nullable().optional(),
});

export type SubscriptionSchema = z.infer<typeof subscriptionSchema>;
