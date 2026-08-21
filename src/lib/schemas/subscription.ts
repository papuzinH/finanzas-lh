import { z } from 'zod';

// El cliente computa exchange_rate en el submit (a partir de rate_pair) y el
// server valida rate > 0. Por eso acá no se exige en la validación del form.
const currencyFields = {
  currency: z.enum(['ARS', 'USD']),
  rate_pair: z.string().nullable().optional(),
  exchange_rate: z.number().positive().nullable().optional(),
};

export const subscriptionSchema = z.object({
  description: z.string().min(3, 'La descripción debe tener al menos 3 caracteres'),
  amount: z.number().positive('El monto debe ser positivo'),
  is_active: z.boolean(),
  category_id: z.string(),
  payment_method_id: z.string().nullable().optional(),
  frequency: z.enum(['monthly', 'yearly']),
  // Día del mes en que se factura. En crédito define en qué resumen cae; en
  // débito alimenta el "vence el X". Hasta 31: el motor clampea al último día
  // que el mes tenga.
  billing_day: z.number().min(1).max(31).optional(),
  ...currencyFields,
});

export type SubscriptionSchema = z.infer<typeof subscriptionSchema>;

export const createSubscriptionSchema = z.object({
  description: z.string().min(3, 'La descripción debe tener al menos 3 caracteres'),
  amount: z.number().positive('El monto debe ser positivo'),
  category_id: z.string().min(1, 'La categoría es requerida'),
  payment_method_id: z.string().nullable().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha es requerida'),
  frequency: z.enum(['monthly', 'yearly']),
  // Día del mes en que se factura. En crédito define en qué resumen cae; en
  // débito alimenta el "vence el X". Hasta 31: el motor clampea al último día
  // que el mes tenga.
  billing_day: z.number().min(1).max(31).optional(),
  ...currencyFields,
});

export type CreateSubscriptionSchema = z.infer<typeof createSubscriptionSchema>;
