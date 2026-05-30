import { z } from 'zod';

const localDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha es requerida');

const currencyFields = {
  currency: z.enum(['ARS', 'USD']),
  rate_pair: z.string().nullable().optional(),
  exchange_rate: z.number().positive().nullable().optional(),
};

const requireUsdRate = (data: { currency: 'ARS' | 'USD'; rate_pair?: string | null; exchange_rate?: number | null }) =>
  data.currency !== 'USD' || (!!data.rate_pair && !!data.exchange_rate && data.exchange_rate > 0);

export const transactionSchema = z
  .object({
    description: z.string().min(3, 'La descripción debe tener al menos 3 caracteres'),
    amount: z.number().positive('El monto debe ser positivo'),
    date: localDateString,
    category_id: z.string().min(1, 'La categoría es requerida'),
    type: z.enum(['income', 'expense'], { message: 'El tipo es requerido' }),
    ...currencyFields,
  })
  .refine(requireUsdRate, { message: 'Falta la cotización del dólar', path: ['exchange_rate'] });

export type TransactionSchema = z.infer<typeof transactionSchema>;

export const createTransactionSchema = z
  .object({
    description: z.string().min(3, 'La descripción debe tener al menos 3 caracteres'),
    amount: z.number().positive('El monto debe ser positivo'),
    date: localDateString,
    category_id: z.string().min(1, 'La categoría es requerida'),
    type: z.enum(['income', 'expense'], { message: 'El tipo es requerido' }),
    payment_method_id: z.string().nullable().optional(),
    ...currencyFields,
  })
  .refine(requireUsdRate, { message: 'Falta la cotización del dólar', path: ['exchange_rate'] });

export type CreateTransactionSchema = z.infer<typeof createTransactionSchema>;
