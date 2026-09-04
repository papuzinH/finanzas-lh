import { z } from 'zod';

const localDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha es requerida');

// El cliente computa exchange_rate en el submit (a partir de rate_pair) y el
// server valida rate > 0. Por eso acá no se exige en la validación del form.
const currencyFields = {
  currency: z.enum(['ARS', 'USD']),
  rate_pair: z.string().nullable().optional(),
  exchange_rate: z.number().positive().nullable().optional(),
};

export const transactionSchema = z.object({
  description: z.string().min(3, 'La descripción debe tener al menos 3 caracteres'),
  amount: z.number().positive('El monto debe ser positivo'),
  date: localDateString,
  category_id: z.string().min(1, 'La categoría es requerida'),
  type: z.enum(['income', 'expense'], { message: 'El tipo es requerido' }),
  payment_method_id: z.string().nullable().optional(),
  income_period: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  ...currencyFields,
});

export type TransactionSchema = z.infer<typeof transactionSchema>;

export const createTransactionSchema = z.object({
  description: z.string().min(3, 'La descripción debe tener al menos 3 caracteres'),
  amount: z.number().positive('El monto debe ser positivo'),
  date: localDateString,
  category_id: z.string().min(1, 'La categoría es requerida'),
  type: z.enum(['income', 'expense'], { message: 'El tipo es requerido' }),
  payment_method_id: z.string().nullable().optional(),
  income_period: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  ...currencyFields,
});

export type CreateTransactionSchema = z.infer<typeof createTransactionSchema>;
