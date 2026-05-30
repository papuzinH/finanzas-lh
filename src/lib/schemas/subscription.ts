import { z } from 'zod';

const currencyFields = {
  currency: z.enum(['ARS', 'USD']),
  rate_pair: z.string().nullable().optional(),
  exchange_rate: z.number().positive().nullable().optional(),
};

const requireUsdRate = (data: { currency: 'ARS' | 'USD'; rate_pair?: string | null; exchange_rate?: number | null }) =>
  data.currency !== 'USD' || (!!data.rate_pair && !!data.exchange_rate && data.exchange_rate > 0);

export const subscriptionSchema = z
  .object({
    description: z.string().min(3, 'La descripción debe tener al menos 3 caracteres'),
    amount: z.number().positive('El monto debe ser positivo'),
    is_active: z.boolean(),
    category_id: z.string(),
    payment_method_id: z.string().nullable().optional(),
    frequency: z.enum(['monthly', 'yearly']),
    debit_payment_day: z.number().min(1).max(28).optional(),
    ...currencyFields,
  })
  .refine(requireUsdRate, { message: 'Falta la cotización del dólar', path: ['exchange_rate'] });

export type SubscriptionSchema = z.infer<typeof subscriptionSchema>;

export const createSubscriptionSchema = z
  .object({
    description: z.string().min(3, 'La descripción debe tener al menos 3 caracteres'),
    amount: z.number().positive('El monto debe ser positivo'),
    category_id: z.string().min(1, 'La categoría es requerida'),
    payment_method_id: z.string().nullable().optional(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha es requerida'),
    frequency: z.enum(['monthly', 'yearly']),
    debit_payment_day: z.number().min(1).max(28).optional(),
    ...currencyFields,
  })
  .refine(requireUsdRate, { message: 'Falta la cotización del dólar', path: ['exchange_rate'] });

export type CreateSubscriptionSchema = z.infer<typeof createSubscriptionSchema>;
