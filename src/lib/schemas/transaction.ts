import { z } from 'zod';

const localDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha es requerida');

export const transactionSchema = z.object({
  description: z.string().min(3, 'La descripción debe tener al menos 3 caracteres'),
  amount: z.number().positive('El monto debe ser positivo'),
  date: localDateString,
  category_id: z.string().min(1, 'La categoría es requerida'),
  type: z.enum(['income', 'expense'], { message: 'El tipo es requerido' }),
});

export type TransactionSchema = z.infer<typeof transactionSchema>;

export const createTransactionSchema = transactionSchema.extend({
  payment_method_id: z.string().nullable().optional(),
});

export type CreateTransactionSchema = z.infer<typeof createTransactionSchema>;
