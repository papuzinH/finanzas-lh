import { z } from 'zod';

export const subscriptionSchema = z.object({
  description: z.string().min(3, 'La descripción debe tener al menos 3 caracteres'),
  amount: z.number().positive('El monto debe ser positivo'),
  is_active: z.boolean(),
  category_id: z.string().nullable().optional(),
  payment_method_id: z.string().nullable().optional(),
});

export type SubscriptionSchema = z.infer<typeof subscriptionSchema>;

export const createSubscriptionSchema = z.object({
  description: z.string().min(3, 'La descripción debe tener al menos 3 caracteres'),
  amount: z.number().positive('El monto debe ser positivo'),
  category_id: z.string().min(1, 'La categoría es requerida'),
  payment_method_id: z.string().nullable().optional(),
});

export type CreateSubscriptionSchema = z.infer<typeof createSubscriptionSchema>;
